'use strict';

const path = require('path');
const RangeAttribute = require(
  path.join(__dirname, '..', 'client', 'RangeAttribute')
);

let ad;
let log;

module.exports = function init($ad, $log) {
  ad = $ad;
  log = $log;
  return parseRangeAttributes;
};

/**
 * Parses the distinguishedName (dn) to remove any invalid characters or to
 * properly escape the request.
 *
 * @private
 *   @param dn {String} The dn to parse.
 * @returns {String}
 */
function parseDistinguishedName(dn) {
  log.trace('parseDistinguishedName(%s)', dn);
  if (! dn) {
    return(dn);
  }

  dn = dn.replace(/"/g, '\\"');
  return dn.replace('\\,', '\\\\,');
}

/**
 * Handles any attributes that might have been returned with a range= specifier.
 *
 * @private
 * @param {object} result The entry returned from the query.
 * @param {LDAPQueryParameters} opts The original LDAP query string parameters
 * to execute.
 * @param {function} callback The callback to execute when completed.
 */
function parseRangeAttributes(result, searcher, callback) {
  //return callback(null, result); // stubbed
  log.trace('parseRangeAttributes(%j)', result);

  // Check to see if any of the result attributes have range= attributes.
  // If not, return immediately.
  if (!RangeAttribute.hasRangeAttributes(result)) {
    return callback(null, result);
  }

  // Parse the range attributes that were provided. If the range attributes are null
  // or indicate that the range is complete, return the result.
  const rangeAttributes = RangeAttribute.getRangeAttributes(result);
  if (rangeAttributes.length === 0) {
    return callback(null, result);
  }

  // Parse each of the range attributes. Merge the range attributes into
  // the properly named property.
  const queryAttributes = [];
  rangeAttributes.forEach((attr) => {
    if (!result[attr.attributeName]) {
      result[attr.attributeName] = [];
    }
    // Merge existing range into the properly named property.
    result[attr.attributeName].push(result[attr.toString()]);
    delete result[attr.toString()];

    // Build our ldap query attributes with the proper attribute;range= tags to
    // get the next sequence of data.
    const queryAttribute = attr.next();
    if (queryAttribute && !queryAttribute.isComplete()) {
      queryAttributes.push(queryAttribute.toString());
    }
  });


  // If we're at the end of the range (i.e. all items retrieved), return the result.
  if (queryAttributes.length === 0) {
    log.debug('All attribute ranges %j retrieved for %s', rangeAttributes, result.dn);
    return callback(null, result);
  }

  log.debug('Attribute range retrieval specifiers %j found for "%s". Next range: %j',
            rangeAttributes, result.dn, queryAttributes);
  // Execute the query again with the query attributes updated.
  const opts = Object.assign(
    {
      filter: `(distinguishedName=${parseDistinguisedName(result.dn)})`,
      attributes: queryAttributes
    },
    searcher.opts
  );

  searcher.search(opts, (err, results) => {
    if (err) {
      return callback(err);
    }

    // Should be only one result
    const item = results[0];
    for (let key of Object.keys(item)) {
      if (!result[key]) {
        result[key] = [];
      }
      if (Array.isArray(result[key])) {
        result[key].push(item[key]);
      }
    }

    callback(null, result);
  });
}