/** Use the game's bundled Three.js Earcut, without adding a dependency. */
import {readFile, writeFile} from 'node:fs/promises';
import {ShapeUtils, Vector2} from '../../../vendor/three/three.module.js';
const data=JSON.parse(await readFile(process.argv[2],'utf8'));
const outer=data.outer.map(p=>new Vector2(...p));
const hole=data.inner.map(p=>new Vector2(...p));
await writeFile(process.argv[3],JSON.stringify(ShapeUtils.triangulateShape(outer,hole.length?[hole]:[])));
