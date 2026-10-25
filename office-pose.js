import { coffeeMotion } from './assets/coffee-trip.js';
import { reactionMotion } from './assets/character-reactions.js';
import { updateOfficeSkin } from './office-skeleton.js?v=0.6.0';
import * as THREE from './vendor/three/three.module.js';
import { LOUNGE_SEAT } from './office-layout.js?v=shift-ux-20261024-v2';

const { lerp, clamp, smoothstep } = THREE.MathUtils;
const DOWN = new THREE.Vector3(0, -1, 0);
const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
export const SEATED_ANKLE = Math.sqrt(.4 ** 2 - .12 ** 2);

// Sagittal two-bone solve. Both soles stay on the floor during a chair transition.
export function legAngles(forward, height) {
  const length = clamp(Math.hypot(forward, height), .03, .78999);
  const hip = Math.atan2(forward, height) + Math.acos(clamp((.4 ** 2 + length ** 2 - .39 ** 2) / (.8 * length), -1, 1));
  const knee = -Math.acos(clamp((length ** 2 - .4 ** 2 - .39 ** 2) / .312, -1, 1));
  return [hip, knee];
}

export function footstep(phase, amount) {
  const p = ((phase % 1) + 1) % 1;
  // 60% support / 40% recovery; support travel matches .8 m root stride.
  const pitch = p < .6 ? .12 * (1 - smooth(p/.12)) - .16 * smooth((p-.44)/.16) : lerp(-.16,.12,smooth((p-.6)/.4));
  return p < .6 ? { y: lerp(.24, -.24, p / .6) * amount, lift: 0, pitch:pitch*amount } :
    { y: lerp(-.24, .24, smooth((p - .6) / .4)) * amount, lift: Math.sin((p - .6) / .4 * Math.PI) * .105 * amount, pitch:pitch*amount };
}

function arm(j, side, target, palmAngle, spread, blend, relaxedElbow = 0) {
  const upper = j[side + 'UpperArm'], fore = j[side + 'Forearm'], wrist = j[side + 'Wrist'];
  if (!wrist) return;
  const torso = j.Torso, inverse = torso.quaternion.clone().invert();
  const goal = target.clone().sub(torso.position).applyQuaternion(inverse).sub(upper.position);
  const d = clamp(goal.length(), .03, .5499), direction = goal.clone().normalize();
  const a = (.285 ** 2 - .265 ** 2 + d * d) / (2 * d), sign = side === 'Left' ? -1 : 1;
  const pole = new THREE.Vector3(sign * lerp(1,.55,relaxedElbow), lerp(-.3,-1,relaxedElbow), lerp(.3,.1,relaxedElbow));
  const bend = pole.addScaledVector(direction, -pole.dot(direction)).normalize();
  const elbow = direction.clone().multiplyScalar(a).addScaledVector(bend, Math.sqrt(Math.max(0, .285 ** 2 - a * a)));
  const upperQ = new THREE.Quaternion().setFromUnitVectors(DOWN, elbow.clone().normalize());
  const foreQ = new THREE.Quaternion().setFromUnitVectors(DOWN, goal.clone().sub(elbow).normalize().applyQuaternion(upperQ.clone().invert()));
  const handQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(palmAngle, spread, 0));
  handQ.premultiply(torso.quaternion.clone().multiply(upperQ).multiply(foreQ).invert());
  upper.quaternion.slerp(upperQ, blend); fore.quaternion.slerp(foreQ, blend); wrist.quaternion.slerp(handQ, blend);
}

export function poseActor(actor, elapsed, reduced) {
  const j = actor.joints, s = actor.sit, t = reduced ? 0 : elapsed + actor.order * 1.73;
  const lounge=actor.loungeBlend||0, rest=actor.restBlend||0;
  const coffee=coffeeMotion(actor.state,actor.stateTime,reduced);
  const reaction=actor.reaction?reactionMotion(actor.reaction.kind,actor.reaction.time,reduced):{strength:0,wave:0};
  const expression=reaction.strength*(1-(actor.gait||0))*(1-rest)*(coffee.active?0:1),kind=actor.reaction?.kind;
  const anchored=['rest-lower','rest-rise'].includes(actor.state);
  const stride = reduced ? 0 : actor.gait, wave = Math.sin(actor.phase * Math.PI * 2);
  const breath = reduced ? 0 : Math.sin(t * 1.7) * .004, lowerLean = Math.sin(s * Math.PI) * .17;
  j.Hips.position.set(0, lerp(.88 - stride * .045 + Math.cos(actor.phase * Math.PI * 4) * stride * .006, lerp(.60,LOUNGE_SEAT.hipHeight,lounge), s), 0);
  j.Hips.rotation.set(0, reduced ? 0 : wave * stride * .025, 0);
  j.Torso.rotation.set(-lowerLean - s * (.04 + actor.workBlend * .07) + rest*(.16+(reduced?0:Math.sin(t*.9)*.012)), reduced ? 0 : wave * stride * -.025, breath * .4);
  // Mira's fitted shoulders need a lower elbow pole, rather than raising the
  // whole forearm to the keys. Keep wrist targets and the chair/sole anchors.
  const miraDesk = actor.id === 'mira' ? s * actor.workBlend * (1-rest) * (1-expression) * (coffee.active?0:1) : 0;
  if(actor.id === 'mira') {
    j.Torso.position.z = -.02 * miraDesk;
    j.Torso.rotation.x -= .04 * miraDesk;
  }
  j.Torso.scale.y = 1 + breath * (1 - stride)-expression*(kind==='sad'?.025:0);
  j.Torso.rotation.x+=expression*(kind==='sad'?-.15:kind==='calm'?.06:kind==='joy'?.035:0);
  j.Torso.rotation.z+=expression*(kind==='joy'?reaction.wave*.045:0);
  const event = actor.eventBlend || 0, result = actor.activity.stage === 'result';
  const think = actor.workBlend * (1 - smoothstep(t % 8, 5.7, 6.4));
  j.Head.rotation.set(lerp(0, -.035, actor.workBlend)+rest*.035, reduced ? 0 : lerp(Math.sin(t * .75) * .065 * (1 - stride), .27, event*(1-rest)) + Math.sin(t * 2.1) * .018 * think, rest*(reduced?0:Math.sin(t*.55)*.025));
  j.Head.rotation.x+=expression*(kind==='sad'?-.22:kind==='joy'?.07:kind==='calm'?-.06-reaction.wave*.025:reaction.wave*.08);
  j.Head.rotation.z+=expression*(kind==='curious'?.12:kind==='sad'?.04:0);
  if(coffee.active){j.Torso.rotation.x-=.09*coffee.reach*(1-coffee.sip);j.Head.rotation.x+=coffee.sip*.045;}
  const talk=(actor.talkBlend||0)*(1-(actor.gait||0))*(1-rest)*(coffee.active?0:1);
  const listen=(actor.listenBlend||0)*(1-(actor.gait||0))*(1-rest)*(coffee.active?0:1);
  j.Head.rotation.y+=(actor.talkTurn||0)*(talk+listen*.55);
  if(!reduced)j.Head.rotation.x+=talk*(.012*Math.sin(t*2.7)+(actor.talkLevel||0)*.025);
  const blinkTime = (t + actor.order * .77) % 4.3;
  const blink = reduced ? 1 : 1 - Math.sin(clamp(blinkTime / .15, 0, 1) * Math.PI) * .97;
  const portraitHead=actor.portraitHead, portraitBlink=portraitHead?.userData?.portraitBlinkMorph;
  if(Number.isInteger(portraitBlink)&&portraitBlink>=0&&portraitHead.morphTargetInfluences?.[portraitBlink]!==undefined)
    portraitHead.morphTargetInfluences[portraitBlink]=1-blink;
  for (const side of ['Left', 'Right']) {
    if (j['Eye' + side]) j['Eye' + side].scale.y = blink;
    if (actor.eyeMeshes?.[side]) actor.eyeMeshes[side].scale.y=blink;
    const sign = side === 'Left' ? -1 : 1;
    const foot = footstep(actor.phase + (sign > 0 ? .5 : 0), stride);
    const forward = anchored ? lerp(.06,LOUNGE_SEAT.footForward,s) : lerp(foot.y, lerp(SEATED_ANKLE,LOUNGE_SEAT.footForward,lounge), s), lift = anchored?0:foot.lift * (1 - s);
    const pitch = anchored?0:foot.pitch * (1 - s), sole = actor.soleHeight(side,pitch);
    const [hip, knee] = legAngles(forward, j.Hips.position.y - sole - lift);
    j[side + 'Thigh'].rotation.set(hip, 0, 0); j[side + 'Shin'].rotation.set(knee, 0, 0); j[side + 'Foot'].rotation.set(-hip - knee + pitch, 0, 0);
    j[side + 'UpperArm'].rotation.set(-wave * sign * stride * .4, 0, -sign * .035);
    j[side + 'Forearm'].rotation.set(.10 + stride * .16 + (actor.restBlend || 0) * (side === 'Left' ? .45 : .18), 0, 0);
    if (j[side + 'Wrist']) j[side + 'Wrist'].rotation.set(.04, 0, 0);
    const mouse = side === 'Right' ? actor.mouseBlend || 0 : 0;
    const typing = actor.workBlend * (1-expression) * (reduced ? 1 : smoothstep(t % 8, .3, .7) * (1 - smoothstep(t % 8, 5.7, 6.2)));
    const tap = reduced ? 0 : Math.sin(t * (side === 'Left' ? 15 : 13) + sign) * .002 * typing;
    const x = lerp(sign * .14, .43 + (reduced ? 0 : Math.sin(t * 2) * .006), mouse);
    const target = new THREE.Vector3(lerp(sign * .18, x, actor.workBlend), lerp(.73, lerp(.864,.870,mouse) + tap, actor.workBlend) - j.Hips.position.y, -lerp(.24, lerp(.55,.46,mouse), actor.workBlend));
    target.lerp(new THREE.Vector3(sign * .30, .84 - j.Hips.position.y, -.30), event*(1-rest));
    target.lerp(new THREE.Vector3(sign*.21, .78-j.Hips.position.y, -.25), lounge*s);
    let palmAngle = lerp(.8, Math.PI / 2, actor.workBlend);
    if (actor.activity.incident && side === 'Right' && !rest) {
      // A quiet, repeated call for attention while the incident awaits the lead.
      // Only the affected seated colleague gestures; feet and pelvis stay anchored.
      const phase = reduced ? 0 : Math.sin(t * 2.6) * .045;
      const gesture = actor.activity.incident === 'noise' ? new THREE.Vector3(.23+phase*.25,1.32+phase*.15-j.Hips.position.y,-.04)
        : ['computer','tension'].includes(actor.activity.incident) ? new THREE.Vector3(.38,1.08+phase-j.Hips.position.y,-.28)
        : new THREE.Vector3(.35+phase,1.45-j.Hips.position.y,-.12);
      target.lerp(gesture,event); palmAngle=lerp(palmAngle,2.6,event);
    }
    if(actor.activity.incident==='tension'&&side==='Left'&&!rest){
      target.lerp(new THREE.Vector3(-.30,1.08+(reduced?0:Math.sin(t*2.6)*.035)-j.Hips.position.y,-.28),event);palmAngle=lerp(palmAngle,2.6,event);
    }
    if (result && actor.reactionTime < 2.8 && side === 'Right' && !reduced) {
      const wave = smoothstep(actor.reactionTime,0,.4) * (1 - smoothstep(actor.reactionTime,2,2.8));
      target.lerp(new THREE.Vector3(.38 + Math.sin(actor.reactionTime * 8) * .055, 1.35 - j.Hips.position.y, -.1),wave); palmAngle = lerp(palmAngle,2.8,wave);
    }
    if(expression>0){
      const gesture=kind==='joy'?new THREE.Vector3(sign*(.30+reaction.wave*.035),1.43+reaction.wave*.035-j.Hips.position.y,-.18)
        :kind==='sad'?new THREE.Vector3(sign*.20,.87-j.Hips.position.y,-.32)
        :kind==='calm'?new THREE.Vector3(sign*.28,.97-j.Hips.position.y,-.25)
        :new THREE.Vector3(sign*.31,1.12-j.Hips.position.y,-.29);
      target.lerp(gesture,expression);palmAngle=lerp(palmAngle,kind==='joy'?2.7:2.1,expression);
    }
    if(side==='Right'&&!reduced&&talk>0){
      target.lerp(new THREE.Vector3(.28,1.08-j.Hips.position.y,-.25),talk*.32);
      palmAngle=lerp(palmAngle,2.2,talk*.3);
    }
    if(coffee.active){
      if(side==='Right'){
        const pickup=new THREE.Vector3(.13,.86-j.Hips.position.y,-.43),mouth=new THREE.Vector3(.10,1.43-j.Hips.position.y,-.16);
        target.lerp(pickup.lerp(mouth,coffee.sip),coffee.reach);palmAngle=lerp(palmAngle,1.8,coffee.reach);
      }else target.lerp(new THREE.Vector3(-.18,.8-j.Hips.position.y,-.13),coffee.reach);
    }
    arm(j, side, target, palmAngle, lerp(sign * .06,-.06,mouse), Math.max(smooth(s),expression,coffee.active?1:0), miraDesk);
    for (let finger = 0; finger < 4; finger++) {
      const digit = j[side + 'Finger' + finger];
      if (digit) digit.rotation.x = coffee.holding&&side==='Right'?-.35: reduced ? -.08 : -.08 - (1 - Math.cos(t * (12 + finger) + finger * 1.3 + sign)) * .14 * typing * (1 - mouse + (finger === 1 ? mouse * .3 : 0));
    }
  }
  if (actor.marker) { actor.marker.visible = actor.selected; actor.marker.rotation.y = reduced ? 0 : elapsed * .6; }
  updateOfficeSkin(actor);
}
