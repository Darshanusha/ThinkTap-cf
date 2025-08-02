
validateAuth = (data, context) => {
    userData = data?.data;
    uid = userData?.uid;    
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    if(uid !== context.auth.uid){
        throw new functions.https.HttpsError('forbidden', 'You are not authorized to perform this action');
    }
}

