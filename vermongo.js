// [1,2,3,4,5,6].diff( [3,4,5] );  => [1, 2, 6]
Array.prototype.diff = function(a) {
  return this.filter(function(i) {
    return a.indexOf(i) < 0;
  });
};

Meteor.Collection.prototype.vermongo = function (op) {
  var collection = this;
  //console.log('[Vermongo]', collection._name, op);
  var options = op || {};
  options.userId = options.userId || false;
  options.ignoredFields = options.ignoredFields || [];

  // Setting hooks for a collection
  var add = function (collection) {
    var name = collection._name;

    // create a new collection if not already existing
    var _versions_collection = new Meteor.Collection(name + '.vermongo');

    /*
     * insert hook
     * */
    collection.before.insert(function (userId, doc) {
      // add vermongo fields
      doc._version = 1;
      if (options['timestamps']) {
        var now = new Date();
        if (!doc.createdAt) doc.createdAt = now;
        if (!doc.modifiedAt) doc.modifiedAt = now;
      }

      if (options.userId)
        doc[options.userId] = userId;

    });


    var copyDoc = function (doc) {
      if (Meteor.isServer) { // avoid duplicated insertion
          // copy doc to versions collection
        var savedDoc = _.extend({}, doc); // shallow copy
        if (typeof(savedDoc._id) !== 'undefined') delete savedDoc._id;
        savedDoc.ref = doc._id;

        _versions_collection.insert(savedDoc);
      }
    };

    /*
     * update hook
     * */
    collection.before.update(function (userId, doc, fieldNames, modifier, hook_options) {
      // do nothing if only ignored fields are modified
      if (fieldNames.diff(options.ignoredFields).equals([])) return;

      // in case of doc not already versionned
      if (!doc._version) doc._version = 1;

      copyDoc(doc);

      // incrementing version
      modifier.$set = modifier.$set || {};
      modifier.$set._version = doc._version + 1;

      // updating 'modifiedAt'
      if (options['timestamps']) {
        modifier.$set.modifiedAt = new Date();
        modifier.$set[options.userId] = userId;
      }
      if (options.userId)
        modifier.$set[options.userId] = userId;

    });

    /*
     * remove hook
     * */
    collection.before.remove(function (userId, doc) {

      // in case of doc not already versionned
      if (!doc._version) doc._version = 1;

      copyDoc(doc); // put last known version in vermongo collection

      // put a dummy version with deleted flag
      doc._version = doc._version + 1;
      if (options['timestamps'])
        doc.modifiedAt = new Date();
      if (options.userId)
        doc[options.userId] = userId;
      doc._deleted = true;
      copyDoc(doc);
    });


    /*
     * collection helpers
     * */
    collection.helpers({
      versions: function () {
        return _versions_collection.find({ref: this._id});
      }

    });

    return collection;
  };

  if (typeof(collection) !== 'undefined' && collection !== null)
    add(collection);

  return collection;
};
