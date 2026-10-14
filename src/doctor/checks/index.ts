import type { CheckId } from '../../types.js';
import type { Check } from '../context.js';
import { checkBudget } from './budget.js';
import { checkConflictFiles } from './conflict-files.js';
import { checkConflictRepo } from './conflict-repo.js';
import { checkDuplicate } from './duplicate.js';
import { checkEmpty } from './empty.js';
import { checkLegacy } from './legacy.js';
import { checkStaleCommand } from './stale-command.js';
import { checkStalePath } from './stale-path.js';

export const CHECKS: { id: CheckId; run: Check }[] = [
  { id: 'conflict/repo', run: checkConflictRepo },
  { id: 'conflict/files', run: checkConflictFiles },
  { id: 'stale/command', run: checkStaleCommand },
  { id: 'stale/path', run: checkStalePath },
  { id: 'duplicate', run: checkDuplicate },
  { id: 'budget', run: checkBudget },
  { id: 'legacy', run: checkLegacy },
  { id: 'empty', run: checkEmpty },
];
