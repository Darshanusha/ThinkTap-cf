let shouldValidateAuth = false;

const OpenAI = require('openai');
const ASSISTANT_ID = 'asst_eTSbNiV4lLmWpJmM9YNzYZkY'; 
const MODEL_ID = 'gpt-4.1-nano';
//https://platform.openai.com/docs/pricing?latest-pricing=standard
const OPENAI_API_KEY = 'API_KEY';
const MAX_TOKENS = 500; // expirement with this value
const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
  })
const dbAdmin = require("firebase-admin");
//dbAdmin.initializeApp();
const promptPath = './src/prompt.txt';
const promptPathV2 = './src/independent_prompt.txt';
const fs = require('fs');

const getOrCreateFunV2 = async (data, context) => {
    userData = data?.data;
    uid = userData?.uid;
    validateAuth(data, context);
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

const getRandomTopic = (topics) => {
    if(!topics || topics?.length === 0){
        return undefined;
    }
    return topics[Math.floor(Math.random() * topics.length)];
}

const getOrCreateTopicsV2 = async (topic, uid) => {
    return await dbAdmin.firestore().collection("topics").doc(uid).get().then((doc) => {
        if (doc.exists) {
            let data = doc.data();
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

const getQuestionOntopicV2 = async (uid, topic, questions = []) => {
    let buildJson = {
        topic: topic,
        exclude_questions: questions
    }
    let prompt = getPromptV2();
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
          console.log("uid :: ",uid);
          return response;
}

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

const readFileAsString = (filePath) => {
    try {
      const data = fs.readFileSync(filePath, 'utf8'); // Synchronous read
      return data;
    } catch (error) {
      console.error(`Error reading file: ${error.message}`);
      return null;
    }
  }

const getPromptV2 = () => {
    return readFileAsString(promptPathV2);
}

module.exports = { getOrCreateFunV2, getRandomTopic, getOrCreateTopicsV2, getQuestionOntopicV2, validateAuth };
