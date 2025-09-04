// Mute list management functions

const { buildMuteList } = require('./eventFactory');
const { loadMuteList, publishMuteList } = require('./contacts');

async function muteUser(pool, relays, sk, pkHex, userToMute, finalizeEvent) {
  if (!pool || !sk || !userToMute) return false;
  
  try {
    // Load current mute list
    const currentMuted = await loadMuteList(pool, relays, pkHex);
    
    // Add new user to mute list
    const newMuted = new Set([...currentMuted, userToMute]);
    
    // Publish updated mute list
    return await publishMuteList(pool, relays, sk, newMuted, buildMuteList, finalizeEvent);
  } catch (err) {
    return false;
  }
}

async function unmuteUser(pool, relays, sk, pkHex, userToUnmute, finalizeEvent) {
  if (!pool || !sk || !userToUnmute) return false;
  
  try {
    // Load current mute list
    const currentMuted = await loadMuteList(pool, relays, pkHex);
    
    // Remove user from mute list
    const newMuted = new Set(currentMuted);
    newMuted.delete(userToUnmute);
    
    // Publish updated mute list
    return await publishMuteList(pool, relays, sk, newMuted, buildMuteList, finalizeEvent);
  } catch (err) {
    return false;
  }
}

async function checkIfMuted(pool, relays, pkHex, userToCheck) {
  if (!pool || !userToCheck) return false;
  
  try {
    const muteList = await loadMuteList(pool, relays, pkHex);
    return muteList.has(userToCheck);
  } catch (err) {
    return false;
  }
}

module.exports = {
  muteUser,
  unmuteUser,
  checkIfMuted
};
