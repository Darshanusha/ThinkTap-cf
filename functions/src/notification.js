const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const dbAdmin = admin.firestore();

const { getRandomCompetitiveTitle } = require("./utils/titlesUtil");
const { getQuestionHelper } = require("./utils/questionsHelper");

const USERS_PAGE_SIZE = 500; // Firestore batch size
const FCM_BATCH_SIZE = 500;   // FCM limit

// Helper to chunk an array
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function callExternalAPI(user) {
  // Example: call your API with user data
  const res = getQuestionHelper({data:{uid:user.id}}, {fromNotification:true})
  //console.log("res :: ",res);

  return res;
}

let successCount = 0;
let failureCount = 0;
let totalTokens = 0;
async function sendNotificationToTokens() {
  try {
    let lastDoc = null;

    while (true) {
      let query = dbAdmin.collection("users")
        .where("fcmToken", ">", "")
        //.where("uid", "==", "pUWyOoTXceYYaBPaUUNPUXJ9HXP2")
        .limit(USERS_PAGE_SIZE);
        //console.log("query :: ",query);

      if (lastDoc) query = query.startAfter(lastDoc);

      const snapshot = await query.get();
      //console.log("snapshot.empty :: ",snapshot.empty);
      if (snapshot.empty) break;

      for (const doc of snapshot.docs) {
        const user = { id: doc.id, ...doc.data() };

        try {
          // 🔹 Call API for this user
          const apiResponse = await callExternalAPI(user);
          totalTokens += apiResponse?.total_tokens;

          // Normalize tokens (single or array)
          const tokens = [];
          if (user.fcmToken) tokens.push(user.fcmToken);
          if (Array.isArray(user.fcmTokens)) tokens.push(...user.fcmTokens);

          if (tokens.length === 0) continue;

          // 🔹 Send personalized notification
          const response = await admin.messaging().sendEachForMulticast({
            tokens,
            notification: { title: getRandomCompetitiveTitle(), body: apiResponse?.question }, // show title as body too
            data: Object.keys(apiResponse || {}).forEach(key => {
              if (typeof apiResponse[key] !== "string") {
                apiResponse[key] = JSON.stringify(apiResponse[key]);
              }
            })
          });


          successCount += response.successCount;
          failureCount += response.failureCount;
          
          //console.log(`User ${user.id} => success: ${response.successCount}, failure: ${response.failureCount}`);

        } catch (err) {
          console.error(`Error for user ${doc.id}:`, err);
        }
      }

      lastDoc = snapshot.docs[snapshot.docs.length - 1];
      if (snapshot.size < USERS_PAGE_SIZE) break;
    }

  } catch (error) {
    console.error("Error sending notifications:", error);
    return error;
  }finally{
    console.log(`Total success: ${successCount}, failure: ${failureCount}`);
    console.log(`Total tokens: ${totalTokens}`);
    successCount = 0;
    failureCount = 0;
    totalTokens = 0;
    return { status: "done" };
  }
}



module.exports = { sendNotificationToTokens };