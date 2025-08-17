

const MAX_QUESTIONS = 40;
const MAX_QUESTIONS_PER_MONTH = 5000;
const MAX_TOKENS_PER_MONTH = 5000000;


const dbAdmin = require("firebase-admin");
const https = require("firebase-functions/https");
//dbAdmin.initializeApp();

const { getOrCreateFunV2, getRandomTopic, getOrCreateTopicsV2, getQuestionOntopicV2 } = require("./helper");

const getQuestionHelper = async (data, context) => {
  userData = await getOrCreateFunV2(data, context);
  data = data?.data;

  mmYYYY = new Date().getMonth() + 1 + "" + new Date().getFullYear();

  questionKey = mmYYYY + "_questions";
  tokenKey = mmYYYY + "_tokens";

  questionCount = userData?.[questionKey] || 0;
  tokenCount = userData?.[tokenKey] || 0;

  if(questionCount >= MAX_QUESTIONS_PER_MONTH || tokenCount >= MAX_TOKENS_PER_MONTH){
      console.log("Max question / token limit reached :: ", questionCount, tokenCount, userData?.uid);
      throw new https.HttpsError('resource-exhausted','Max question / token limit reached', `You have reached the maximum number of questions ${questionCount} / tokens ${tokenCount} for this month please contact dugnam@gmail.com for extension`);
  }


  if(!userData?.topics || userData?.topics?.length === 0){
      return null;
  }

  topic = getRandomTopic(userData?.topics);

  topicCollection = await getOrCreateTopicsV2(topic, userData?.uid);
  questions = topicCollection?.[topic];

  let res = await getQuestionOntopicV2(userData?.uid, topic, questions)
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

  dbAdmin.firestore().collection("users").doc(userData?.uid).update({
      [questionKey]: questionCount + 1,
      [tokenKey]: tokenCount + res.usage.total_tokens
  })
  return mcq;
}

module.exports = { getQuestionHelper };