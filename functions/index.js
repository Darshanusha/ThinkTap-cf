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
dbAdmin.initializeApp();
let shouldValidateAuth = false;

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