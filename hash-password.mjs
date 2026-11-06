// توليد بصمة آمنة لكلمة المرور: node scripts/hash-password.mjs "كلمة-المرور"
import { hashPassword } from "../functions/lib/core.js";
const password = process.argv[2];
if (!password || password.length < 10) {
  console.error("الاستخدام: node scripts/hash-password.mjs \"كلمة مرور قوية (10 أحرف على الأقل)\"");
  process.exit(1);
}
console.log(await hashPassword(password));
