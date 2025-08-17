const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v2/https");
const { FieldValue } = require('firebase-admin/firestore'); 

const db = admin.firestore();

const handelWrongAnswer = async (data, context) => {
  try {
    console.log("data :: ", data?.data);
    const { uid, wrongQA } = data?.data;

    if (!uid || !wrongQA) {
      throw new HttpsError('invalid-argument', 'Missing userId or wrongAnswer');
    }

    const userRef = db.collection("wrongAnswers").doc(uid);
    const docSnap = await userRef.get();
    let mmYYYY = new Date().getMonth() + 1 + "" + new Date().getFullYear();

    if (docSnap.exists) {
      // ✅ Update existing doc
      await userRef.update({
        [mmYYYY]: FieldValue.arrayUnion(wrongQA),
      });
    } else {
      // ✅ Create new doc
      await userRef.set({
        [mmYYYY]: [wrongQA],
      });
    }

    return { success: true, message: "Wrong answer recorded" };
  } catch (error) {
    console.error("Error in handelWrongAnswer:", error);
    throw new HttpsError('internal', 'Internal server error', error);
  }
};

module.exports = { handelWrongAnswer };
