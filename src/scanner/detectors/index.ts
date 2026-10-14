import type { Detector } from '../../types.js';
import { agentFilesDetector } from './agent-files.js';
import { flutterDetector } from './flutter.js';
import { goDetector } from './go.js';
import { jvmDetector } from './jvm.js';
import { nodeDetector } from './node.js';
import { phpDetector } from './php.js';
import { pythonDetector } from './python.js';
import { toolingDetector } from './tooling.js';

export {
  agentFilesDetector,
  flutterDetector,
  goDetector,
  jvmDetector,
  nodeDetector,
  phpDetector,
  pythonDetector,
  toolingDetector,
};

/** Every detector, run in this order for each workspace. */
export const DETECTORS: Detector[] = [
  nodeDetector,
  flutterDetector,
  phpDetector,
  pythonDetector,
  goDetector,
  jvmDetector,
  toolingDetector,
  agentFilesDetector,
];
