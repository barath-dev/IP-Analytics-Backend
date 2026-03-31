const PocketBase = require('pocketbase/cjs');
const pb = new PocketBase('https://ip-analytics.pockethost.io/');
pb.authStore.save("0xsnb9i4dfh44jo", null);

async function test() {
    try {
        console.log("Fetching Projects...");
        const res = await pb.collection('Projects').getFullList();
        console.log("Projects:", res.length);
    } catch (e) {
        console.error("Projects Error:", e.status, e.response);
    }
    
    try {
        console.log("Fetching IP_Details...");
        const res2 = await pb.collection('IP_Details').getFullList();
        console.log("IP_Details:", res2.length);
    } catch (e) {
        console.error("IP_Details Error:", e.status, e.response);
    }
}
test();
