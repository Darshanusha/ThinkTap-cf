const admin = require("firebase-admin");
const auth = admin.auth();
const https = require("firebase-functions/https");
const shouldVerifyAuth = true;
const verifyAuth = async (data, context) => {
    if(!shouldVerifyAuth){
        return data.data.uid;
    }
    
    token = data.rawRequest.headers.authorization;
    if(!token){
        throw new https.HttpsError('unauthenticated', 'Authentication required');
    }
    token = token.split("Bearer ")[1];
    let res = await auth.verifyIdToken(token, true);
    if(data?.data?.uid != res.uid){
        throw new https.HttpsError('forbidden', 'You are not authorized to perform this action');
    }
    let isAuth = res.email_verified && res.exp > Date.now() / 1000;
    if(!isAuth){
        throw new https.HttpsError('unauthenticated', 'Authentication required');
    }
    console.log("res :: ",res.uid);
    return res.uid;
}

module.exports = { verifyAuth };
