export {
  DEFAULT_TEXT_FIELD,
  createCollaborativeDoc,
  encodeDocumentStateVector,
  encodeFullState,
  getDocumentText,
} from "./collab/create-doc.js";
export {
  REMOTE_UPDATE_ORIGIN,
  applyRemoteUpdate,
  encodeUpdateSince,
} from "./collab/apply-update.js";
export { attachIndexedDbPersistence } from "./collab/persistence.js";
