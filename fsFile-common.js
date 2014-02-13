/** @method FS.File
 * @namespace FS.File
 * @constructor
 * @param {object|File|Blob} ref File reference
 * @todo Should we refactor the file record into `self.record`?
 */
FS.File = function(ref, createdByTransform) {
  var self = this;

  self.createdByTransform = createdByTransform;

  if (typeof ref !== 'object')
    throw new Error('FS.File expects an object as argument');

  // Extend self with filerecord related data
  _.extend(self, FS.Utility.cloneFileRecord(ref));

  /** @method FS.File.prototype._attachFile
   * @param {File|Blob} ref File or Blob instance to attach
   * @private
   */
  self._attachFile = function(ref) {
    var self = this;
    if (typeof File !== "undefined" && ref instanceof File) {
      self.utime = ref.lastModifiedDate;
      self.blob = ref; // File inherits from Blob so this is OK
    } else if (typeof Blob !== "undefined" && ref instanceof Blob) {
      self.utime = new Date;
      self.blob = ref;
    }
  };

  self._attachFile(ref);
};

/** @method FS.File.prototype.uploadProgress
 * @returns {number} The server confirmed upload progress
 */
FS.File.prototype.uploadProgress = function() {
  var self = this;
  // If we are passed a file object and the object is mounted on a collection
  if (self.isMounted()) {

    // Make sure our file record is updated
    self.getFileRecord();

    // Return the confirmed progress
    return Math.round(self.bytesUploaded / self.size * 100);
  }
};

/** @method FS.File.prototype.controlledByDeps
 * @returns {FS.Collection} Returns true if this FS.File is reactive
 *
 * > Note: Returns true if this FS.File object was created by a FS.Collection
 * > and we are in a reactive computations. What does this mean? Well it should
 * > mean that our fileRecord is fully updated by Meteor and we are mounted on
 * > a collection
 */
FS.File.prototype.controlledByDeps = function() {
  var self = this;
  return self.createdByTransform && Deps.active;
};

/** @method FS.File.prototype.getCollection
 * @returns {FS.Collection} Returns attached collection or undefined if not mounted
 */
FS.File.prototype.getCollection = function() {
  // Get the collection reference
  var self = this;

  // If we already made the link then do no more
  if (self.collection) {
    return self.collection;
  }

  // If we don't have a collectionName then there's not much to do, the file is
  // not mounted yet
  if (!self.collectionName) {
    // Should not throw an error here - could be common that the file is not
    // yet mounted into a collection
    return;
  }

  // Link the collection to the file
  self.collection = FS._collections[self.collectionName];

  return self.collection; //possibly undefined, but that's desired behavior
};

/** @method FS.File.prototype.isMounted
 * @returns {FS.Collection} Returns attached collection or undefined if not mounted
 *
 * > Note: This will throw an error if collection not found and file is mounted
 * > *(got an invalid collectionName)*
 */
FS.File.prototype.isMounted = FS.File.prototype.getCollection;

/** @method FS.File.prototype.fetch Returns the fileRecord
 * @returns {object} The filerecord
 * @deprecated Refactored into [getFileRecord](#FS.File.prototype.getFileRecord)
 */


/** @method FS.File.prototype.getFileRecord Returns the fileRecord
 * @returns {object} The filerecord
 */
FS.File.prototype.getFileRecord = function() {
  var self = this;
  // Check if this file object fileRecord is kept updated by Meteor, if so
  // return self
  if (self.controlledByDeps()) {
    return self;
  }
  // Go for manually updating the file record
  if (self.isMounted()) {
    FS.debug && console.log('GET FILERECORD: ' + self._id);

    // Return the fileRecord or an empty object
    var fileRecord = self.collection.files.findOne({_id: self._id}) || {};
    _.extend(self, fileRecord);
    return fileRecord;
  } else {
    // We return an empty object, this way users can still do `getRecord().size`
    // Without getting an error
    return {};
  }
};

/** @method FS.File.prototype.update
 * @param {modifier} modifier
 * @param {object} [options]
 * @param {function} [callback]
 */
// Update the fileRecord
FS.File.prototype.update = function(modifier, options, callback) {
  var self = this;
  FS.debug && console.log('UPDATE: ' + JSON.stringify(modifier));
  // Make sure we have options and callback
  if (!callback && typeof options === 'function') {
    callback = options;
    options = {};
  }

  if (self.isMounted()) {
    // Call collection update - File record
    return self.collection.files.update({_id: self._id}, modifier, options, function(err, count) {
      // Update the fileRecord if it was changed and on the client
      // The server-side methods will pull the fileRecord if needed
      if (count > 0 && Meteor.isClient)
        self.getFileRecord();
      // If we have a callback then call it
      if (typeof callback === 'function')
        callback(err, count);
    });
  }
};

/**
 * Remove the current file from its FS.Collection
 *
 * @method FS.File.prototype.remove
 * @param {Function} [callback]
 * @returns {number} Count
 */
FS.File.prototype.remove = function(callback) {
  var self = this;
  callback = callback || FS.Utility.defaultCallback;
  // Remove any associated temp files
  if (Meteor.isServer) {
    FS.TempStore.deleteChunks(self);
  }
  if (self.isMounted()) {
    return self.collection.files.remove({_id: self._id}, function(err, res) {
      if (!err) {
        delete self._id;
        delete self.binary;
        delete self.collection;
        delete self.collectionName;
      }
      callback(err, res);
    });
  } else {
    callback(new Error("Cannot remove a file that is not associated with a collection"));
    return;
  }
};

/** @method FS.File.prototype.moveTo
 * @param {FS.Collection} targetCollection
 * @private // Marked private until implemented
 * @todo Needs to be implemented
 *
 * Move the file from current collection to another collection
 *
 * > Note: Not yet implemented
 */

/** @method FS.File.prototype.get
 * @param {object} [options]
 * @param {string} [options.storeName] Name of the store to get from. If not defined
 * on the client, the first store saved into `fsFile.copies` is used. If not
 * defined on the server, the first store defined in `options.stores` for the
 * collection is used. So if there is only one store, you can generally omit
 * this, but if there are multiple, it's best to specify.
 * @param {number} [options.start]
 * @param {number} [options.end]
 * @returns {number} Count
 *
 * Client: Instructs the DownloadTransferQueue to begin downloading the file copy
 * Server: Returns the Buffer data for the copy
 */
FS.File.prototype.get = function(options) {
  var self = this;
  // Make sure options are set
  options = options || {};

  // Call the client / server dependent code
  return self._get(options);
};

/** @method FS.File.prototype.url Construct the file url
 * @param {object} [options]
 * @param {string} [options.store] Name of the store to get from. If not defined,
 * the first store defined in `options.stores` for the collection is used.
 * @param {boolean} [options.auth=null] Wether or not the authenticate
 * @param {boolean} [options.download=false] Should headers be set to force a download
 *
 * Return the http url for getting the file - on server set auth if wanting to
 * use authentication on client set auth to true or token
 */
FS.File.prototype.url = function(options) {
  var self = this;
  options = options || {};
  options = _.extend({
    store: null,
    auth: null,
    download: false
  }, options.hash || options); // check for "hash" prop if called as helper

  if (self.isMounted()) {
    var storeName = options.store;

    // On the client, it's best to always pass the `store` option or
    // define a defaultStoreName for every FS.Collection. This helps
    // avoid issues with reactive rendering of images, among other things.
    if (!storeName && Meteor.isClient) {
      storeName = self.collection.options.defaultStoreName;
    }

    if (!self.collection.httpUrl) {
      throw new Error('FS.File.url FS.Collection "' + self.collection.name + '" has no HTTP access point; set useHTTP option to true');
    }

    // TODO: Could we somehow figure out if the collection requires login?
    var authToken = '';
    if (typeof Accounts !== "undefined") {
      if (options.auth !== false) {
        authToken = Accounts._storedLoginToken() || '';
      }
    } else if (typeof options.auth === "string") {
      authToken = options.auth;
    }

    if (authToken !== '') {
      // Construct the token string to append to url
      authToken = '?token=' + authToken;
    }

    // Construct the http method url
    var urlPrefix = (options.download) ? '/download/' : '/';
    if (typeof storeName === "string" && storeName.length) {
      if (!self.hasCopy(storeName)) {
        // We want to return null if we know the URL will be a broken
        // link because then we can avoid rendering broken links, broken
        // images, etc.
        return null;
      }
      storeName = '/' + storeName;
    } else {
      storeName = '';
    }

    return self.collection.httpUrl + urlPrefix + self._id + storeName + authToken;
  }

};

/** @method FS.File.prototype.downloadUrl Get the download url
 * @param {object} [options]
 * @param {string} [options.store] Name of the store to get from. If not defined,
 * the first store defined in `options.stores` for the collection is used.
 * @param {boolean} [options.auth=null] Wether or not the authenticate
 * @deprecated Use The hybrid helper `FS.File.url`
 */
FS.File.prototype.downloadUrl = function(options) {
  options = options || {};
  options = options.hash || options;
  options.download = true;
  return FS.File.prototype.url.call(this, options);
};

/** @method FS.File.prototype.put Stores the file data
 * @param {function} [callback] Callback for returning errors and updated FS.File
 *
 ```
 fo.put(function(err, fo) {
 if (err) {
 console.log('Got an error');
 } else {
 console.log('Passed on the file: ' + fo);
 }
 });
 ```
 */
FS.File.prototype.put = function(callback) {
  var self = this;

  callback = callback || FS.Utility.defaultCallback;

  if (!self._id) {
    callback(new Error("FS.File.put needs _id"));
    return;
  }

  // If on client
  if (Meteor.isClient) {
    FS.uploadQueue.uploadFile(self);
    callback(null, self);
  } else if (Meteor.isServer) {
    // Save the binary to a single chunk temp file, so that it is available
    // when FileWorker calls saveCopies.
    // This will also trigger file handling from collection observes.
    FS.TempStore.ensureForFile(self);
  }
};

/** @method FS.File.prototype.resume
 * @param {File|Blob|Buffer} ref
 * @todo WIP, Not yet implemented for server
 *
 * > This function is not yet implemented for server
 */
FS.File.prototype.resume = function(ref) {
  var self = this;
  if (Meteor.isClient) {
    self._attachFile(ref);
    FS.uploadQueue.resumeUploadingFile(self);
  }
};

/** @method FS.File.prototype.getExtension Returns the lowercase file extension
 * @returns {string} The extension eg.: `jpg` or if not found then an empty string ''
 */
FS.File.prototype.getExtension = function() {
  var self = this;
  // Make sure our file record is updated
  self.getFileRecord();
  // Get name from file record
  var name = self.name;
  // Seekout the last '.' if found
  var found = name.lastIndexOf('.') + 1;
  // Return the extension if found else ''
  return (found > 0 ? name.substr(found).toLowerCase() : '');
};

/** @method FS.File.prototype.toDataUrl
 * @param {function} callback Callback(err, dataUrl) (callback is optional on server)
 * @todo Split client and server code
 */
FS.File.prototype.toDataUrl = function(callback) {
  var self = this;

  if (Meteor.isClient) {
    if (typeof callback !== 'function')
      throw new Error("toDataUrl requires function as callback");

    if (typeof FileReader === "undefined") {
      callback(new Error("Browser does not support FileReader"));
      return;
    }

    var fileReader = new FileReader();
    fileReader.onload = function(event) {
      callback(null, event.target.result);
    };
    fileReader.onerror = function(err) {
      callback(err);
    };
    try {
      var blob = self.getBlob();
      fileReader.readAsDataURL(blob);
    } catch (err) {
      callback(err);
    }
  }

  else if (Meteor.isServer) {
    var hasCallback = (typeof callback === 'function');
    callback = callback || FS.Utility.defaultCallback;
    var buffer = self.getBuffer();
    if (!buffer || !self.type) {
      callback(new Error("toDataUrl requires a buffer loaded in the FS.File and a contentType"));
      return;
    }

    var data_uri_prefix = "data:" + self.type + ";base64,";
    var url = data_uri_prefix + buffer.toString("base64");
    if (hasCallback) {
      callback(null, url);
    } else {
      return url;
    }
  }
};

function checkContentType(fsFile, storeName, startOfType) {
  var type;
  if (storeName && fsFile.hasCopy(storeName)) {
    type = fsFile.copies[storeName].type;
  } else {
    type = fsFile.type;
  }
  if (typeof type === "string") {
    return type.indexOf(startOfType) === 0;
  }
  return false;
}
;

/** @method FS.File.prototype.isImage Is it an image file?
 * @param {object} [options]
 * @param {string} [options.store] The store we're interested in
 *
 * Returns true if the copy of this file in the specified store has an image
 * content type. If the file object is unmounted or doesn't have a copy for
 * the specified store, or if you don't specify a store, this method checks
 * the content type of the original file.
 */
FS.File.prototype.isImage = function(options) {
  return checkContentType(this, (options || {}).store, 'image/');
};

/** @method FS.File.prototype.isVideo Is it a video file?
 * @param {object} [options]
 * @param {string} [options.store] The store we're interested in
 *
 * Returns true if the copy of this file in the specified store has a video
 * content type. If the file object is unmounted or doesn't have a copy for
 * the specified store, or if you don't specify a store, this method checks
 * the content type of the original file.
 */
FS.File.prototype.isVideo = function(options) {
  return checkContentType(this, (options || {}).store, 'video/');
};

/** @method FS.File.prototype.isAudio Is it an audio file?
 * @param {object} [options]
 * @param {string} [options.store] The store we're interested in
 *
 * Returns true if the copy of this file in the specified store has an audio
 * content type. If the file object is unmounted or doesn't have a copy for
 * the specified store, or if you don't specify a store, this method checks
 * the content type of the original file.
 */
FS.File.prototype.isAudio = function(options) {
  return checkContentType(this, (options || {}).store, 'audio/');
};

/** @method FS.File.prototype.isUploaded Is this file completely uploaded?
 * @returns {boolean} True if the number of uploaded bytes is equal to the file size.
 */
FS.File.prototype.isUploaded = function() {
  var self = this;

  // Make sure we use the updated file record
  self.getFileRecord();

  return self.bytesUploaded === self.size;
};

/** @method FS.File.prototype.chunkIsUploaded Is the chunk completely uploaded?
 * @param {number} start
 * @returns {boolean} True if the chunk starting at start has already been uploaded successfully.
 */
FS.File.prototype.chunkIsUploaded = function(start) {
  var self = this;

  // Make sure we use the updated file record
  self.getFileRecord();

  return !!_.findWhere(self.chunks, {start: start});
};

/** @method FS.File.prototype.hasMaster A copy was saved in the master store.
 * @returns {boolean} True if a copy of this file was saved in the master store.
 */
FS.File.prototype.hasMaster = function() {
  return this.hasCopy("_master");
};

/** @method FS.File.prototype.hasCopy
 * @param {string} storeName Name of the store to check for a copy of this file
 * @param {boolean} [optimistic=false] In case that the file record is not found, read below
 * @returns {boolean} If the copy exists or not
 *
 * > Note: If the file is not published to the client or simply not found:
 * this method cannot know for sure if it exists or not. The `optimistic`
 * param is the boolean value to return. Are we `optimistic` that the copy
 * could exist. This is the case in `FS.File.url` we are optimistic that the
 * copy supplied by the user exists.
 */
FS.File.prototype.hasCopy = function(storeName, optimistic) {
  var self = this;
  // Make sure we use the updated file record
  self.getFileRecord();
  // If we havent the published data then
  if (_.isEmpty(self.copies)) {
    return !!optimistic;
  }
  if (typeof storeName === "string") {
    return (self.copies && !_.isEmpty(self.copies[storeName]));
  }
  return false;
};

/** @method FS.File.prototype.hasMaster Does the attached collection allow this file?
 * @returns {boolean} True if the attached collection allows this file.
 *
 * Checks based on any filters defined on the attached collection. If the
 * file is not valid according to the filters, this method returns false
 * and also calls the filter `onInvalid` method defined for the attached
 * collection, passing it an English error string that explains why it
 * failed.
 *
 */
FS.File.prototype.fileIsAllowed = function() {
  var self = this;

  if (self.isMounted()) {

    var filter = self.collection.options.filter;
    if (!filter) {
      return true;
    }
    var filename = self.name;
    if (!filename) {
      filter.onInvalid && filter.onInvalid("The file has no name");
      return false;
    }
    var contentType = self.type;
    if (!contentType) {
      filter.onInvalid && filter.onInvalid(filename + " has an unknown content type");
      return false;
    }
    var fileSize = self.size;
    if (!fileSize || isNaN(fileSize)) {
      filter.onInvalid && filter.onInvalid(filename + " has an unknown file size");
      return false;
    }
    var saveAllFileExtensions = (filter.allow.extensions.length === 0);
    var saveAllContentTypes = (filter.allow.contentTypes.length === 0);
    var ext = self.getExtension();
    if (!((saveAllFileExtensions ||
            _.indexOf(filter.allow.extensions, ext) !== -1) &&
            _.indexOf(filter.deny.extensions, ext) === -1)) {
      filter.onInvalid && filter.onInvalid(filename + ' has the extension "' + ext + '", which is not allowed');
      return false;
    }
    if (!((saveAllContentTypes ||
            contentTypeInList(filter.allow.contentTypes, contentType)) &&
            !contentTypeInList(filter.deny.contentTypes, contentType))) {
      filter.onInvalid && filter.onInvalid(filename + ' is of the type "' + contentType + '", which is not allowed');
      return false;
    }
    if (typeof filter.maxSize === "number" && fileSize > filter.maxSize) {
      filter.onInvalid && filter.onInvalid(filename + " is too big");
      return false;
    }
    return true;

  }

};

var contentTypeInList = function(list, contentType) {
  var listType, found = false;
  for (var i = 0, ln = list.length; i < ln; i++) {
    listType = list[i];
    if (listType === contentType) {
      found = true;
      break;
    }
    if (listType === "image/*" && contentType.indexOf("image/") === 0) {
      found = true;
      break;
    }
    if (listType === "audio/*" && contentType.indexOf("audio/") === 0) {
      found = true;
      break;
    }
    if (listType === "video/*" && contentType.indexOf("video/") === 0) {
      found = true;
      break;
    }
  }
  return found;
};
