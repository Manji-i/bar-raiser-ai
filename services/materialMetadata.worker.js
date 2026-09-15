import { parentPort, workerData } from 'node:worker_threads';
import { parseFile } from 'music-metadata';

try {
  const metadata = await parseFile(workerData, { duration: true, skipCovers: true });
  parentPort.postMessage({ duration: metadata.format.duration });
} catch {
  parentPort.postMessage({ error: true });
}
