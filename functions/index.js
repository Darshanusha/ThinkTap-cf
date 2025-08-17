/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions, https} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const logger = require("firebase-functions/logger");
const dbAdmin = require("firebase-admin");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { sendNotificationToTokens } = require("./src/notification");

//dbAdmin.initializeApp();



const { getQuestionHelper } = require("./src/utils/questionsHelper");
const { getRandomTopic, validateAuth, getPromptV2 } = require("./src/utils/helper");

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

exports.helloWorld =  https.onCall((data, context) => {
    logger.info("Hello logs!", {structuredData: true});
    logger.info("data", data);
    logger.info("context", context);
    return "Hello from Firebase!";
});

exports.cronToSendNotification = onSchedule(
    {
      schedule: "0 8,20 * * *",
      timeZone: "Asia/Kolkata"
    },
    (event) => {
        sendNotificationToTokens("Quiz Alert", "You have a new practice question");
    }
  );

exports.addFcmToken = https.onCall(async (data, context) => {
    userData = data?.data;
    uid = userData?.uid;
    validateAuth(data, context);
    console.log("userData :: ",userData);
    return await dbAdmin.firestore().collection("users").doc(uid).update({
        fcmToken: userData?.fcmToken
    });
});

exports.testNofification = https.onCall(async (data, context) => {
    return await sendNotificationToTokens("Quiz Alert", "You have a new practice question");
});

const getAllFcmTokens = async () => {
    try {
      const usersSnapshot = await dbAdmin.firestore().collection("users").get();
  
      let allTokens = [];
  
      usersSnapshot.forEach((doc) => {
        const data = doc.data();
  
        // If you store single token
        if (data.fcmToken) {
          allTokens.push(data.fcmToken);
        }
  
        // // If you store array of tokens
        // if (Array.isArray(data.fcmTokens)) {
        //   allTokens = allTokens.concat(data.fcmTokens);
        // }
      });
  
      // Remove duplicates & empty/null tokens
      const uniqueTokens = [...new Set(allTokens)].filter(Boolean);
  
      return uniqueTokens;
    } catch (error) {
      console.error("Error fetching FCM tokens:", error);
      return error;
    }
}

const sendNotification = (token, question, body) => {

    const message = buildMessage(token, "Start Practice", "You have a new practice question")
    //const message  = buildMessageV2()

    try {
        dbAdmin.messaging().send(message);
        console.log('Notification sent successfully');
        return null;
    } catch (error) {
        console.error('Error sending notification:', error);
        return null;
    }
}

const buildMessage = (token, title, body) => {
    const message = {
        token: token, // FCM device token
        notification: {
          title: title,
          body: body,
        },
        android: {
          priority: "high",
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
            },
          },
        },
      };
}

exports.getQuestionsV1 =  https.onCall(async (data, context) => {
  return getQuestionHelper(data, context);
});


exports.getQuestionsThread =  https.onCall(async (data, context) => {
    

    console.log("data :: ",data);
    
    userData = await getOrCreateFun(data, context);
    data = data?.data;
    if(userData?.topics?.length === 0){
        return [];
    }
    console.log("userData :: ",userData);
    topic = getRandomTopic(userData?.topics);
    console.log("topic :: ",topic);
    agentId = userData?.agentId;
    console.log("agentId :: ",agentId);
    if(!agentId || agentId.trim() === ''){
        console.log("setPrompt");
        const {threadId, questions} = await setPrompt(userData?.uid, topic);
        await dbAdmin.firestore().collection("users").doc(userData?.uid).update({
            agentId: threadId
        })
        return questions;
    }
    return await getQuestionOntopic(data?.option, topic, agentId)
});





const getQuestionOntopic = async (option, topic, threadId) => {
    var response = await openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: "{'answer': '" + option + "','nextTopic': '" + topic + "'}",
      });
    questions = await runAssistant(threadId);
    return {threadId: threadId, questions: questions}
}

const setPrompt = async (uid, initialTopic) => {
    prompt = getPrompt(initialTopic);
    const threadId = await getOrCreateThreadId(uid);
    var response = await openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: prompt,
      });

    questions = await runAssistant(threadId);

    return {threadId: threadId, questions: questions}
}

const runAssistant = async (threadId) => {
    console.log("start thread :: ",threadId);
    const run = await openai.beta.threads.runs.create(threadId, {
        assistant_id: ASSISTANT_ID
      });

      console.log("run :: ",run);
    
      // Poll until run completes (you could also use webhooks for better performance)
      let completed = false;
      let runStatus = null;
      while (!completed) {
        console.log("run.id :: ",run.id);
        console.log("threadId :: ",threadId);
        if (!threadId || !run?.id) {
            console.log("Missing threadId or run.id");
            throw new Error("Missing threadId or run.id");
          }
        runStatus = await openai.beta.threads.runs.retrieve(run.id, {thread_id: threadId});
        console.log("runStatus :: ",runStatus);
        if (runStatus.status === 'completed') {
          completed = true;
        } else if (['failed', 'cancelled', 'expired'].includes(runStatus.status)) {
          throw new Error('Run failed: ' + runStatus.status);
        }
        await new Promise((r) => setTimeout(r, 1000)); // wait 1 sec
      }
    
      // Retrieve messages
      const messages = await openai.beta.threads.messages.list(threadId, {
        order: 'desc',
        limit: 2
      });
      return messages;
}



const getPrompt = (initialTopic) => {
    return readFileAsString(promptPath).replace("${topic}", initialTopic);
}

const getOrCreateThreadId = async (uid) => {
    const userRef = dbAdmin.firestore().collection('users').doc(uid);
    const doc = await userRef.get();
    if (doc.exists && doc.data().thread_id) {
      return doc.data().thread_id;
    }
    const thread = await openai.beta.threads.create();
    await userRef.set({ thread_id: thread.id }, { merge: true });
    return thread.id;
}

exports.getOrCreateTopicCollection =  https.onCall(async (data, context) => {
    return await getOrCreateFun(data, context);
});



const getOrCreateFun = async (data, context) => {
    userData = data?.data;
    uid = userData?.uid;
    validateAuth(data, context);
    console.log("context :: ",context.auth);
    console.log("userData :: ",userData);
    return await dbAdmin.firestore().collection("users").doc(uid).get().then((doc) => {
        if (doc.exists) {
            return doc.data();
        } else {
            dbAdmin.firestore().collection("users").doc(uid).set({
                agentId: '',
                name: userData?.name,
                email: userData?.email,
                uid: uid,
                topics:[],
                createdAt: new Date(),
                updatedAt: new Date()
            });
            return dbAdmin.firestore().collection("users").doc(uid).get();
        }
    }).catch((error) => {
        return error;
    });
}

exports.updateTopic = https.onCall(async (data, context) => {
    userData = data?.data;
    uid = userData?.uid;
    validateAuth(data, context);
    console.log("context :: ",context.auth);
    console.log("userData :: ",userData);
    userDbData = await getOrCreateFun(data, context);
    userDbData.topics = userData?.topics;
    userDbData.updatedAt = new Date();
    return await dbAdmin.firestore().collection("users").doc(uid).update(userDbData);
});

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });


