/**
 * Drive folder architecture + file placement for the pipeline.
 * Folder IDs are cached in Script Properties after first creation so we
 * never re-search Drive by name on every submission.
 */

function getOrCreateRootStructure_() {
  var props = PropertiesService.getScriptProperties();
  var rootId = props.getProperty(CONFIG.PROPERTY_KEYS.ROOT_FOLDER_ID);
  var rootFolder = rootId ? safeGetFolder_(rootId) : null;

  if (!rootFolder) {
    rootFolder = findOrCreateFolder_(DriveApp.getRootFolder(), CONFIG.DRIVE.ROOT_FOLDER_NAME);
    props.setProperty(CONFIG.PROPERTY_KEYS.ROOT_FOLDER_ID, rootFolder.getId());
  }

  var subfolders = {};
  Object.keys(CONFIG.DRIVE.SUBFOLDERS).forEach(function (key) {
    var name = CONFIG.DRIVE.SUBFOLDERS[key];
    var propKey = CONFIG.PROPERTY_KEYS.SUBFOLDER_ID_PREFIX + key;
    var id = props.getProperty(propKey);
    var folder = id ? safeGetFolder_(id) : null;

    if (!folder) {
      folder = findOrCreateFolder_(rootFolder, name);
      props.setProperty(propKey, folder.getId());
    }
    subfolders[key] = folder;
  });

  return { root: rootFolder, subfolders: subfolders };
}

function safeGetFolder_(id) {
  try {
    return DriveApp.getFolderById(id);
  } catch (err) {
    return null;
  }
}

function findOrCreateFolder_(parent, name) {
  var existing = parent.getFoldersByName(name);
  if (existing.hasNext()) return existing.next();
  return parent.createFolder(name);
}

function getSubfolderForStatus_(statusKey) {
  return getOrCreateRootStructure_().subfolders[statusKey];
}

function createClientFolder_(aralCode, clientName, policyType) {
  var structure = getOrCreateRootStructure_();
  var safeClient = (clientName || 'Unknown_Client').replace(/[\\\/:*?"<>|]/g, '_').trim();
  var safePolicy = (policyType || 'Motor').replace(/[\\\/:*?"<>|]/g, '_').trim();
  var folderName = aralCode + '_' + safeClient + '_' + safePolicy;
  // New folders start in Incomplete; the vetting engine moves them on immediately after.
  return structure.subfolders.INCOMPLETE.createFolder(folderName);
}

function moveFolderToStatus_(folder, statusKey) {
  var target = getSubfolderForStatus_(statusKey);
  var parents = folder.getParents();
  while (parents.hasNext()) {
    var parent = parents.next();
    if (parent.getId() !== target.getId()) {
      parent.removeFile(folder);
    }
  }
  target.addFile(folder);
  return folder;
}

/**
 * Google Forms file-upload answers are a comma+space separated list of
 * Drive URLs/IDs. This pulls every Drive file ID out of such an answer.
 */
function extractFileIdsFromAnswer_(answer) {
  if (!answer) return [];
  var ids = [];
  var regex = /[-\w]{25,}/g;
  var match;
  while ((match = regex.exec(answer)) !== null) {
    ids.push(match[0]);
  }
  return ids;
}

/**
 * Moves the file(s) referenced by a Forms file-upload answer out of
 * Forms' internal upload folder and into the client folder, prefixing
 * the filename with docKey so later re-vetting can recognize it.
 * Returns true if at least one file was found and moved.
 */
function attachUploadToFolder_(answer, folder, docKey) {
  var fileIds = extractFileIdsFromAnswer_(answer);
  if (fileIds.length === 0) return false;

  fileIds.forEach(function (fileId, index) {
    try {
      var file = DriveApp.getFileById(fileId);
      var suffix = fileIds.length > 1 ? '_' + (index + 1) : '';
      file.setName(docKey + suffix + '__' + file.getName());
      var parents = file.getParents();
      while (parents.hasNext()) {
        parents.next().removeFile(file);
      }
      folder.addFile(file);
    } catch (err) {
      // Already moved on a re-processed submission, or file was deleted upstream; skip it.
    }
  });

  return true;
}

/** True if the folder already contains a file whose name starts with docKey. */
function folderHasDoc_(folder, docKey) {
  var files = folder.getFiles();
  while (files.hasNext()) {
    if (files.next().getName().indexOf(docKey) === 0) return true;
  }
  return false;
}
