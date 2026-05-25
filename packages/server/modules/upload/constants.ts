import * as path from 'path';

const RESOURCE_ROOT = path.join(__dirname, '..', '..', 'resources');
const UPLOAD_ROOT = path.join(RESOURCE_ROOT, 'uploads');
const AUDIO_ROOT = path.join(RESOURCE_ROOT, 'audio');
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export { RESOURCE_ROOT, UPLOAD_ROOT, AUDIO_ROOT, MAX_IMAGE_BYTES };
