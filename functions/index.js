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
const fs = require('fs');
dbAdmin.initializeApp();
let shouldValidateAuth = false;
const OpenAI = require('openai');
const ASSISTANT_ID = 'asst_eTSbNiV4lLmWpJmM9YNzYZkY'; 
const MODEL_ID = 'gpt-4.1-nano';
//https://platform.openai.com/docs/pricing?latest-pricing=standard
const OPENAI_API_KEY = 'API_KEY';
const promptPath = './src/prompt.txt';
const promptPathV2 = './src/independent_prompt.txt';
const MAX_TOKENS = 500; // expirement with this value

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
  });

const MAX_QUESTIONS = 40;

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

exports.getQuestionsV1 =  https.onCall(async (data, context) => {

    userData = await getOrCreateFunV2(data, context);
    data = data?.data;
    if(userData?.topics?.length === 0){
        return [];
    }
    topic = getRandomTopic(userData?.topics);
    console.log("topic :: ",topic);

    topicCollection = await getOrCreateTopicsV2(topic, userData?.uid);
    questions = topicCollection?.[topic];

    let res = await getQuestionOntopicV2(topic, questions)
    let mcq = JSON.parse(res.choices[0].message.content);
    if(!questions || questions?.length === 0){
        questions = [];
    }
    questions.push(mcq.question);
    if(questions.length >= MAX_QUESTIONS){
        questions.splice(0, questions.length - MAX_QUESTIONS);
    }

    dbAdmin.firestore().collection("topics").doc(userData?.uid).update({
        [topic]: questions
    })
    return mcq;
    
    
});

const getQuestionOntopicV2 = async (topic, questions = []) => {
    let buildJson = {
        topic: topic,
        exclude_questions: questions
    }
    let prompt = getPromptV2();
    console.log("buildJson :: ",buildJson);
    let response = await openai.chat.completions.create({
            model: MODEL_ID,
            messages: [
              {
                role: "system",
                content: prompt,
              },
              {
                role: "user",
                content: JSON.stringify(buildJson),
              },
            ],
            max_tokens: MAX_TOKENS,
            temperature: 0.7,
          });
          console.log("response.usage.total_tokens :: ",response?.usage?.total_tokens);
          return response;
}

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

const readFileAsString = (filePath) => {
    try {
      const data = fs.readFileSync(filePath, 'utf8'); // Synchronous read
      return data;
    } catch (error) {
      console.error(`Error reading file: ${error.message}`);
      return null;
    }
  }

  const getRandomTopic = (topics) => {
    return topics[Math.floor(Math.random() * topics.length)];
  }

const getQuestionOntopic = async (option, topic, threadId) => {
    var response = await openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: "{'answer': '" + option + "','nextTopic': '" + topic + "'}",
      });
    console.log("response :: ",response);
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

      console.log("response :: ",response);

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

const getPromptV2 = () => {
    return readFileAsString(promptPathV2);
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

const getOrCreateFunV2 = async (data, context) => {
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
                responseId: '',
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

const getOrCreateTopicsV2 = async (topic, uid) => {
    return await dbAdmin.firestore().collection("topics").doc(uid).get().then((doc) => {
        if (doc.exists) {
            let data = doc.data();
            console.log("topics :: ",data);
            return data;
        } else {
            dbAdmin.firestore().collection("topics").doc(uid).set({
                [topic] : []
            });
            return dbAdmin.firestore().collection("topics").doc(uid).get();
        }
    }).catch((error) => {
        return error;
    });
}

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


const validateAuth = (data, context) => {
    if(!shouldValidateAuth){
        return;
    }
    userData = data?.data;
    uid = userData?.uid;    
    if (!context.auth) {
        throw new https.HttpsError('unauthenticated', 'Authentication required');
    }
    if(uid !== context.auth.uid){
        throw new https.HttpsError('forbidden', 'You are not authorized to perform this action');
    }
}