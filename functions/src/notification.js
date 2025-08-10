const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

const USERS_PAGE_SIZE = 1000; // Firestore batch size
const FCM_BATCH_SIZE = 500;   // FCM limit

// Helper to chunk an array
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function sendNotificationToTokens(title, body) {
  try {
    if (!title || !body) {
      return res.status(400).json({ error: "Missing 'title' or 'body'" });
    }

    let lastDoc = null;
    let allTokens = [];

    // Paginate Firestore reads
    while (true) {
      let query = db.collection("users").limit(USERS_PAGE_SIZE);
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snapshot = await query.get();
      if (snapshot.empty) break;

      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.fcmToken) allTokens.push(data.fcmToken);
        if (Array.isArray(data.fcmTokens)) allTokens.push(...data.fcmTokens);
      });

      lastDoc = snapshot.docs[snapshot.docs.length - 1];
      if (snapshot.size < USERS_PAGE_SIZE) break; // no more pages
    }

    // Remove duplicates and falsy values
    const uniqueTokens = [...new Set(allTokens)].filter(Boolean);

    if (uniqueTokens.length === 0) {
      return res.status(200).json({ message: "No tokens found" });
    }

    // Chunk tokens for FCM
    const tokenChunks = chunkArray(uniqueTokens, FCM_BATCH_SIZE);

    let successCount = 0;
    let failureCount = 0;

    for (const chunk of tokenChunks) {
      const response = await admin.messaging().sendEachForMulticast({
        tokens: chunk,
        notification: { title, body },
      });
      successCount += response.successCount;
      failureCount += response.failureCount;
    }

    console.log("successCount :: ",successCount);
    console.log("failureCount :: ",failureCount);

  } catch (error) {
    console.error("Error sending notifications:", error);
    return error;
  }
}


module.exports = { sendNotificationToTokens };