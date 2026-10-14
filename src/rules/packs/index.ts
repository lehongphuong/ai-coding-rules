import type { RulePack } from '../pack.js';
import { commonPack } from './common.js';
import { dartPack } from './dart.js';
import { djangoPack } from './django.js';
import { expressPack } from './express.js';
import { fastapiPack } from './fastapi.js';
import { flutterPack } from './flutter.js';
import { goPack } from './go.js';
import { javascriptPack } from './javascript.js';
import { jvmPack } from './jvm.js';
import { laravelPack } from './laravel.js';
import { monorepoPack } from './monorepo.js';
import { nestjsPack } from './nestjs.js';
import { nextjsPack } from './nextjs.js';
import { phpPack } from './php.js';
import { pythonPack } from './python.js';
import { reactPack } from './react.js';
import { typescriptPack } from './typescript.js';
import { vuePack } from './vue.js';

/** Every built-in pack, in evaluation order. */
export const PACKS: RulePack[] = [
  commonPack,
  typescriptPack,
  javascriptPack,
  reactPack,
  nextjsPack,
  vuePack,
  nestjsPack,
  expressPack,
  flutterPack,
  dartPack,
  laravelPack,
  phpPack,
  pythonPack,
  djangoPack,
  fastapiPack,
  goPack,
  jvmPack,
  monorepoPack,
];
