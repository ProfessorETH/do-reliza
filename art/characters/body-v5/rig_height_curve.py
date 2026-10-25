"""Monotone PCHIP height fit, independent of Blender and third-party packages.

Fritsch/Butland weighted harmonic interior derivatives and one-sided shape-
preserving endpoint derivatives. Exact anchor interpolation; C1, no overshoot.
"""
from bisect import bisect_right
import math


def monotone_hermite(knots):
    points=[(float(x),float(y)) for x,y in knots]
    if len(points)<2 or any(not math.isfinite(v) for p in points for v in p):
        raise ValueError('Height curve needs at least two finite anchors')
    if any(a[0]>=b[0] or a[1]>b[1] for a,b in zip(points,points[1:])):
        raise ValueError('Height anchors must increase in X and not decrease in Y')
    x=[p[0] for p in points];y=[p[1] for p in points]
    h=[b-a for a,b in zip(x,x[1:])]
    delta=[(b-a)/width for a,b,width in zip(y,y[1:],h)]
    if len(points)==2:
        slopes=[delta[0],delta[0]]
    else:
        def endpoint(h0,h1,d0,d1):
            slope=((2*h0+h1)*d0-h0*d1)/(h0+h1)
            if slope*d0<=0:return 0.0
            if d0*d1<=0 and abs(slope)>3*abs(d0):return 3*d0
            return slope
        slopes=[endpoint(h[0],h[1],delta[0],delta[1])]
        for i in range(1,len(points)-1):
            before,after=delta[i-1],delta[i]
            if before*after<=0:
                slopes.append(0.0)
            else:
                w1=2*h[i]+h[i-1];w2=h[i]+2*h[i-1]
                slopes.append((w1+w2)/(w1/before+w2/after))
        slopes.append(endpoint(h[-1],h[-2],delta[-1],delta[-2]))

    def evaluate(value,derivative=False):
        value=float(value)
        if value<x[0]:return slopes[0] if derivative else y[0]+(value-x[0])*slopes[0]
        if value>x[-1]:return slopes[-1] if derivative else y[-1]+(value-x[-1])*slopes[-1]
        i=min(len(h)-1,max(0,bisect_right(x,value)-1));t=(value-x[i])/h[i]
        if derivative:
            return ((6*t*t-6*t)*y[i]+(3*t*t-4*t+1)*h[i]*slopes[i]+(-6*t*t+6*t)*y[i+1]+(3*t*t-2*t)*h[i]*slopes[i+1])/h[i]
        return (2*t**3-3*t*t+1)*y[i]+(t**3-2*t*t+t)*h[i]*slopes[i]+(-2*t**3+3*t*t)*y[i+1]+(t**3-t*t)*h[i]*slopes[i+1]

    anchors=[];maximum_jump=0.0
    for i,(a,b) in enumerate(points):
        row={'source_y':a,'target_y':b,'actual_y':evaluate(a),'derivative':slopes[i]}
        if 0<i<len(points)-1:
            epsilon=min(h[i-1],h[i])*1e-8
            left=evaluate(a-epsilon,True);right=evaluate(a+epsilon,True)
            maximum_jump=max(maximum_jump,abs(left-right))
            row.update(left_derivative_limit_sample=left,right_derivative_limit_sample=right)
        anchors.append(row)
    minimum_derivative=math.inf;maximum_overshoot=0.0
    for i in range(len(h)):
        for j in range(201):
            a=x[i]+h[i]*j/200;v=evaluate(a)
            minimum_derivative=min(minimum_derivative,evaluate(a,True))
            maximum_overshoot=max(maximum_overshoot,y[i]-v,v-y[i+1])
    proof={'method':'PCHIP weighted harmonic derivatives; one-sided shape-preserving endpoints',
           'anchors':anchors,'maximum_anchor_error':max(abs(evaluate(a)-b) for a,b in points),
           'minimum_sampled_derivative':minimum_derivative,'maximum_sampled_overshoot':maximum_overshoot,
           'maximum_one_sided_derivative_difference':maximum_jump,'samples_per_segment':201}
    if proof['maximum_anchor_error']>1e-10 or minimum_derivative < -1e-10 or maximum_overshoot>1e-10 or maximum_jump>1e-5:
        raise ValueError('Monotone height proof failed')
    return evaluate,proof
