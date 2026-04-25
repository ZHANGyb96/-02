/**
 * @fileoverview AlphaScan AI 独立激活码生成器 (Keygen)
 * 使用方法: node keygen.js
 * 功能: 1. 生成 RSA 密钥对 2. 签发分级激活码
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

console.log("==========================================");
console.log("   AlphaScan AI 商业授权管理控制台");
console.log("==========================================\n");

// 1. 生成 RSA 2048 密钥对
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

console.log("--- [核心配置] 请将此公钥粘贴到 Node.js API 的 .env 中 (APP_PUBLIC_KEY) ---");
console.log(publicKey);
console.log("--- [核心配置] 请严密保管私钥，不要泄露 ---\n");

/**
 * 签发激活码函数
 * @param {string} tier 等级: BASIC, PRO, ELITE
 * @param {number} daysValid 有效天数 (0 为永久)
 */
function generateLicense(tier, daysValid = 365) {
    const iat = Math.floor(Date.now() / 1000);
    const payload = {
        tier: tier,
        iat: iat,
    };

    if (daysValid > 0) {
        payload.exp = iat + (daysValid * 24 * 60 * 60);
    }

    // 使用私钥签名
    const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });
    
    console.log(`>>> 成功签发 [${tier}] 级别激活码 (${daysValid === 0 ? '永久有效' : daysValid + ' 天有效'}):`);
    console.log("------------------------------------------");
    console.log(token);
    console.log("------------------------------------------\n");
}

// 示例：签发三个不同等级的激活码
generateLicense('BASIC', 30);
generateLicense('PRO', 365);
generateLicense('ELITE', 0);

console.log("提示：将上述生成的 JWT 字符串发给客户，客户在软件激活页粘贴即可。");
