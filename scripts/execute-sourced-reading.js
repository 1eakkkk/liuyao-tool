// Retains the original fixed one-pair plan; new revisions use a separate entry point.
import {prepareSourcedPairs} from '../experiments/reading-quality/sourced-pairs.js';
import {executeFixedSourcedPilot} from './sourced-pilot-runtime.js';
const [directory]=process.argv.slice(2);
if(!directory || process.argv.length!==3) throw Error('Use <prepared-one-pair-directory>');
await executeFixedSourcedPilot(directory,await prepareSourcedPairs('one-pair'));
