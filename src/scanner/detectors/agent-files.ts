import type { DetectContext, Detector, Fact } from '../../types.js';
import { agentsForFile } from '../../core/index.js';
import { ev, fact } from '../util.js';

/** Existing AI instruction files (SPEC §6.1), reported once at root scope. */
export const agentFilesDetector: Detector = {
  id: 'agent-files',
  detect({ files, dir }: DetectContext): Fact[] {
    if (dir !== '') return [];
    const out: Fact[] = [];
    for (const path of files.paths) {
      const agents = agentsForFile(path);
      if (agents.length)
        out.push(fact('agentFile', path, '', [ev(path)], 1, { target: agents.join(',') }));
    }
    return out;
  },
};
