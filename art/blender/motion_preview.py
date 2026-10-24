"""Editable control poses sampled from office-pose.js, not rendered video.

Regenerate with node scripts/bake-motion-preview.js after changing the rig/pose code.
Walk: frames 1..31; sit: 50..80; mouse/keyboard: 100..130. Runtime remains IK-driven.
"""
import json
from pathlib import Path
preview=json.loads((Path(PROJECT_ROOT)/'art/blender/motion-preview.json').read_text('utf-8'))
prefix='Release3D_'+preview['agent']+'_'
for sample in preview['poses']:
    for name,pose in sample['joints'].items():
        obj=bpy.data.objects.get(prefix+name)
        if not obj: continue
        obj.animation_data_clear()
# Each object receives a native editable action. Clearing happens only once above.
for sample in preview['poses']:
    for name,pose in sample['joints'].items():
        obj=bpy.data.objects.get(prefix+name)
        if not obj: continue
        obj.location=pose['p'];obj.rotation_mode='QUATERNION';obj.rotation_quaternion=pose['q'];obj.scale=pose['s']
        for key in ['location','rotation_quaternion','scale']: obj.keyframe_insert(data_path=key,frame=sample['frame'],group=sample['clip'])
bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=150;bpy.context.scene.render.fps=30
bpy.context.scene.frame_set(100)
print('CONTROL_POSES_READY',len(preview['poses']),'runtime samples, native Blender actions; source at work pose')
