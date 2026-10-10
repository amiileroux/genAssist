/**
 * Drive folder architecture + file placement for the pipeline.
 * Folder IDs are cached in Script Properties after first creation so we
 * never re-search Drive by name on every submission.
 *
 * Structure (one root, one subtree per line of business):
 *   /ARAL_Insurance_Pipeline/
 *     Motor/
 *       01_Incomplete_Flagged/ 02_Needs_Supplemental_Info/ 03_Ready_For_Underwriting/ 04_Completed_Policies/
 *     Property/
 *       01_Incomplete_Flagged/ 02_Needs_Supplemental_Info/ 03_Ready_For_Underwriting/ 04_Completed_Policies/
 */

function getOrCreateRootFolder_() {
  var props = PropertiesService.getScriptProperties();
  var rootId = props.getProperty(CONFIG.PROPERTY_KEYS.ROOT_FOLDER_ID);
  var rootFolder = rootId ? safeGetFolder_(rootId) : null;

  if (!rootFolder) {
    rootFolder = findOrCreateFolder_(DriveApp.getRootFolder(), CONFIG.DRIVE.ROOT_FOLDER_NAME);
    props.setProperty(CONFIG.PROPERTY_KEYS.ROOT_FOLDER_ID, rootFolder.getId());
  }
  return rootFolder;
}

/** @return {{root:Folder, lineFolder:Folder, subfolders:Object}} the Drive structure for one line of business. */
function getOrCreateLineStructure_(lineKey) {
  var line = getLineConfig_(lineKey);
  var props = PropertiesService.getScriptProperties();
  var rootFolder = getOrCreateRootFolder_();

  var lineFolderPropKey = CONFIG.PROPERTY_KEYS.SUBFOLDER_ID_PREFIX + lineKey + '_ROOT';
  var lineFolderId = props.getProperty(lineFolderPropKey);
  var lineFolder = lineFolderId ? safeGetFolder_(lineFolderId) : null;
  if (!lineFolder) {
    lineFolder = findOrCreateFolder_(rootFolder, line.DRIVE_SUBFOLDER_NAME);
    props.setProperty(lineFolderPropKey, lineFolder.getId());
  }

  var subfolders = {};
  Object.keys(CONFIG.DRIVE.SUBFOLDERS).forEach(function (key) {
    var name = CONFIG.DRIVE.SUBFOLDERS[key];
    var propKey = CONFIG.PROPERTY_KEYS.SUBFOLDER_ID_PREFIX + lineKey + '_' + key;
    var id = props.getProperty(propKey);
    var folder = id ? safeGetFolder_(id) : null;

    if (!folder) {
      folder = findOrCreateFolder_(lineFolder, name);
      props.setProperty(propKey, folder.getId());
    }
    subfolders[key] = folder;
  });

  return { root: rootFolder, lineFolder: lineFolder, subfolders: subfolders };
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

function getSubfolderForStatus_(lineKey, statusKey) {
  return getOrCreateLineStructure_(lineKey).subfolders[statusKey];
}

/**
 * @param {string} lineKey 'MOTOR' or 'PROPERTY'
 * @param {string} aralCode
 * @param {string} clientName
 * @param {string} categoryLabel - Coverage Type (Motor) or Type of Occupancy (Property), used in the folder name
 */
function createClientFolder_(lineKey, aralCode, clientName, categoryLabel) {
  var structure = getOrCreateLineStructure_(lineKey);
  // Client Name isn't collected on either form (it's read off the uploaded
  // DP Licence by whoever reviews it), so a fresh submission is unnamed
  // until an admin sets it via the dashboard - see AdminController.admin_setClientName.
  var safeClient = (clientName || 'Pending-Name').replace(/[\\\/:*?"<>|]/g, '_').trim();
  var safeCategory = (categoryLabel || getLineConfig_(lineKey).LABEL).replace(/[\\\/:*?"<>|]/g, '_').trim();
  var folderName = aralCode + '_' + safeClient + '_' + safeCategory;
  // New folders start in Incomplete; the vetting engine moves them on immediately after.
  return structure.subfolders.INCOMPLETE.createFolder(folderName);
}

/** Renames a client folder in place, keeping its ARAL code prefix. Used when an admin sets the client's name. */
function renameClientFolder_(folder, aralCode, newClientName, categoryLabel) {
  var safeClient = (newClientName || 'Pending-Name').replace(/[\\\/:*?"<>|]/g, '_').trim();
  var safeCategory = (categoryLabel || 'Insurance').replace(/[\\\/:*?"<>|]/g, '_').trim();
  folder.setName(aralCode + '_' + safeClient + '_' + safeCategory);
}

function moveFolderToStatus_(lineKey, folder, statusKey) {
  var target = getSubfolderForStatus_(lineKey, statusKey);
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
