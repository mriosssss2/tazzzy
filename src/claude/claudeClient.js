const { jsonrepair } = require('jsonrepair');
// src/claude/claudeClient.js

const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function extractProfileInfo(html) {
  const prompt = `Extract the following information from this Facebook profile HTML (if available):
  - Where they work (including if they are a broker)
  - The company's Facebook page
  - The company's website
  - The person's following/friends amount (QTY)
  - The company's following amount (QTY)
  - Their LinkedIn profile
  - The company's name
  - Entity type (Australian Pvt Company or other)
  - ABN status
  - Marital status (e.g. married, single, in a relationship, etc.)
  - Who they are married to (if available)
Return as a JSON object with these fields: worksAt, isBroker, companyFacebook, companyWebsite, personFollowers, companyFollowers, linkedin, companyName, entityType, abnStatus, maritalStatus, marriedTo.

Profile HTML:
${html}`;
  try {
    console.log('[Claude] Sending prompt to Claude:');
    console.log(prompt);
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      temperature: 0.2,
      system: 'You are an expert data extractor. Only return valid JSON. Do not include any explanation, markdown, or extra text.',
      messages: [
        { role: 'user', content: prompt }
      ]
    });
    let text = '';
    if (Array.isArray(response.content) && response.content.length > 0 && response.content[0].text) {
      text = response.content[0].text;
    } else if (typeof response.content === 'string') {
      text = response.content;
    }
    console.log('[Claude] Raw response:');
    console.log(text);
    try {
      const parsed = JSON.parse(text);
      console.log('[Claude] Parsed JSON:', parsed);
      return parsed;
    } catch (e1) {
      // Try to repair malformed JSON
      try {
        const repaired = jsonrepair(text);
        console.log('[Claude] Trying jsonrepair. Repaired text:');
        console.log(repaired);
        const parsed = JSON.parse(repaired);
        console.log('[Claude] Parsed repaired JSON:', parsed);
        return parsed;
      } catch (e2) {
        console.error('Claude JSON parse error (jsonrepair):', e2);
        return { error: 'Could not parse Claude response', raw: text };
      }
    }
  } catch (err) {
    console.error('Claude API error:', err);
    return { error: 'Claude API error', message: err.message };
  }
}

module.exports = { extractProfileInfo };
