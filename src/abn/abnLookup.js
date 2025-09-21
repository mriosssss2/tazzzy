// src/abn/abnLookup.js
const axios = require('axios');
require('dotenv').config();

/**
 * Looks up ABN details using the ABR API.
 * If input is a valid ABN (11 digits), uses AbnDetails; otherwise, uses MatchingNames.
 * @param {string} abnOrName - ABN or company name
 * @returns {Promise<object>} - ABN details or error
 */
async function lookupABN(abnOrName) {
  const apiKey = process.env.ABN_API_KEY;
  const isAbn = /^\d{11}$/.test(abnOrName.replace(/\s/g, ''));
  let url;
  if (isAbn) {
    url = `https://abr.business.gov.au/json/AbnDetails.aspx?abn=${encodeURIComponent(abnOrName)}&guid=${apiKey}`;
  } else {
    url = `https://abr.business.gov.au/json/MatchingNames.aspx?name=${encodeURIComponent(abnOrName)}&guid=${apiKey}`;
  }
  try {
    const res = await axios.get(url);
    const json = JSON.parse(res.data.replace(/^callback\((.*)\);?$/, '$1'));
    if (json.Message && json.Message.includes('not a valid ABN or ACN')) {
      return { error: 'Input is not a valid ABN or ACN. Try searching by company name.' };
    }
    if (json.Message && json.Message.includes('No results found')) {
      return { error: 'No results found for this ABN or name.' };
    }
    // If name search, return first match details if available
    if (json.Names && Array.isArray(json.Names) && json.Names.length > 0) {
      return json.Names[0];
    }
    // If ABN search, return details
    if (json.Abn) {
      return {
        entityType: json.EntityTypeName,
        abnStatus: json.AbnStatus,
        abn: json.Abn,
        name: json.EntityName,
        ...json
      };
    }
    return { error: 'No valid ABN or name data found.' };
  } catch (e) {
    return { error: e.message };
  }
}

module.exports = { lookupABN };
