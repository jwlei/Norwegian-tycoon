// Connects to Firebase only after an anonymous sign-in, so database rules can require auth.
// Reads, listeners and writes made before then are queued by the offline database.
(function () {
    const firebaseConfig = {
        apiKey: "AIzaSyAPzwDQP5O-Ki042JQ8H8M_82ujk30rKI8",
        authDomain: "tycoon-240ff.firebaseapp.com",
        databaseURL: "https://tycoon-240ff-default-rtdb.europe-west1.firebasedatabase.app",
        projectId: "tycoon-240ff",
        storageBucket: "tycoon-240ff.firebasestorage.app",
        messagingSenderId: "384963652157",
        appId: "1:384963652157:web:705add99ad053d94669854",
        measurementId: "G-5TP1MPNW8Q"
    };
    firebase.initializeApp(firebaseConfig);
    const database = firebase.database();
    database.goOffline();
    let online = false;
    function connect() {
        if (online) { return; }
        online = true;
        database.goOnline();
    }
    firebase.auth().onAuthStateChanged(function (user) {
        if (user) {
            connect();
            return;
        }
        firebase.auth().signInAnonymously().catch(function (error) {
            // Without Anonymous Authentication enabled, still connect so open rules keep working.
            console.warn("Anonym innlogging feilet; kobler til uten autentisering.", error);
            connect();
        });
    });
})();
