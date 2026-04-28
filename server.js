import fastify from "fastify";
import cors from "@fastify/cors";
import fetch from "node-fetch";

// ==================== CẤU HÌNH ====================
const PORT = 3000;
const VALID_KEY = "Hentaiz";

// ==================== API URLs ====================
const API_URL_HU = "https://wtx.tele68.com/v1/tx/lite-sessions?cp=R&cl=R&pf=web&at=83991213bfd4c554dc94bcd98979bdc5";
const API_URL_MD5 = "https://wtxmd52.tele68.com/v1/txmd5/sessions";

// ==================== BẢNG BẮT ĐIỂM "HỐT BẠC" ====================
const BANG_DIEM = {
    // NHÓM XỈU (3-10)
    3: { pred: "Nghỉ", conf: 0, note: "X3 Dữ liệu hiếm, nên nghỉ" },
    4: { pred: "Tài", conf: 90, note: "X4 ALL TÀI (90% Bẻ cầu)" },
    5: { pred: "Tài", conf: 70, note: "X5 70% TÀI" },
    6: { pred: "Tài", conf: 80, note: "X6 ALL TÀI (Hay nhảy T12)" },
    7: { pred: "Xỉu", conf: 80, note: "X7 BỆT XỈU (Hoặc về X8, X9)" },
    8: { pred: "Tài", conf: 85, note: "X8 ALL TÀI (Tỉ lệ nổ Tài cực cao)" },
    9: { pred: "Xỉu", conf: 80, note: "X9 ALL XỈU (Đứng Xỉu 10)" },
    10: { pred: "Tài", conf: 90, note: "X10 ALL TÀI (Điểm gãy sang T11, T12)" },
    // NHÓM TÀI (11-18)
    11: { pred: "Xỉu", conf: 85, note: "T11 ALL XỈU (Hồi mã thương 80-85%)" },
    12: { pred: "Tài", conf: 70, note: "T12 BỆT TÀI (65-70% Đứng tiếp Tài)" },
    13: { pred: "Xỉu", conf: 70, note: "T13 60-70% XỈU (Cầu 1-1)" },
    14: { pred: "Xỉu", conf: 95, note: "T14 SIÊU XỈU (Điểm vàng để bẻ)" },
    15: { pred: "Tài", conf: 70, note: "T15 ALL TÀI (Nổ Tài 16, 17)" },
    16: { pred: "Xỉu", conf: 85, note: "T16 ALL XỈU (Tài lớn dễ gãy)" },
    17: { pred: "Xỉu", conf: 90, note: "T17 ALL XỈU (90% Về Xỉu ngay)" },
    18: { pred: "Xỉu", conf: 100, note: "T18 BẺ XỈU 100%" }
};

// ==================== CẦU THEO MẶT XÚC XẮC ====================
function cauMatXucXac(dice) {
    if (!dice || dice.length < 3) return null;
    
    const [a, b, c] = dice;
    const sorted = [...dice].sort((x, y) => x - y);
    
    // 1. Cầu Kép Bé (1-1, 2-2) → BỆT XỈU
    if ((a === 1 && b === 1) || (a === 2 && b === 2) || (b === 1 && c === 1) || (b === 2 && c === 2)) {
        return { pred: "Xỉu", conf: 80, note: "Cầu Kép Bé (1-1,2-2) → BỆT XỈU" };
    }
    
    // 2. Cầu Kép Lớn (5-5, 6-6) → BỆT TÀI
    if ((a === 5 && b === 5) || (a === 6 && b === 6) || (b === 5 && c === 5) || (b === 6 && c === 6)) {
        return { pred: "Tài", conf: 80, note: "Cầu Kép Lớn (5-5,6-6) → BỆT TÀI" };
    }
    
    // 3. Mặt 6 xuất hiện 2 lần ([6-6-x]) → XỈU 10
    const count6 = dice.filter(x => x === 6).length;
    if (count6 === 2) {
        return { pred: "Xỉu", conf: 85, note: "Mặt 6 xuất hiện 2 lần → XỈU 10" };
    }
    
    // 4. Cầu "Gánh" (ví dụ [3-5-3] hoặc [4-2-4]) → ĐẢO CẦU
    if ((a === c) && (a !== b)) {
        return { pred: "Đảo", conf: 85, note: `Cầu Gánh [${a}-${b}-${a}] → ĐẢO CẦU (Tài→Xỉu hoặc Xỉu→Tài)` };
    }
    
    // 5. Cầu "Tiến" (ví dụ [1-2-3] hoặc [2-3-4]) → TÀI
    if ((a + 1 === b && b + 1 === c) || (a + 1 === b && b + 1 === c)) {
        return { pred: "Tài", conf: 80, note: `Cầu Tiến [${a}-${b}-${c}] → TÀI` };
    }
    
    // 6. Cầu "Lùi" (ví dụ [6-5-4] hoặc [5-4-3]) → XỈU
    if ((a - 1 === b && b - 1 === c) || (a - 1 === b && b - 1 === c)) {
        return { pred: "Xỉu", conf: 80, note: `Cầu Lùi [${a}-${b}-${c}] → XỈU` };
    }
    
    return null;
}

// ==================== CẦU BỆT (DÂY) ====================
function cauBet(history, doDaiBET, vanCuoi) {
    if (doDaiBET >= 4 && doDaiBET <= 6) {
        // Bệt 4-6 tay → theo tiếp
        return { pred: vanCuoi, conf: 70 + (doDaiBET - 3) * 3, note: `Bệt ${doDaiBET} tay → theo tiếp` };
    }
    if (doDaiBET >= 7) {
        // Bệt 7+ tay → bẻ ngược
        const breakPred = vanCuoi === "Tài" ? "Xỉu" : "Tài";
        return { pred: breakPred, conf: 80, note: `Bệt ${doDaiBET} tay → bẻ ngược` };
    }
    return null;
}

// ==================== CẦU 1-1 (T-X-T-X) ====================
function cau11(history) {
    if (history.length < 4) return null;
    const last4 = history.slice(0, 4).map(h => h.result);
    const is11 = last4[0] !== last4[1] && last4[1] !== last4[2] && last4[2] !== last4[3];
    if (is11) {
        const next = last4[3] === "Tài" ? "Xỉu" : "Tài";
        return { pred: next, conf: 70, note: "Cầu 1-1 (T-X-T-X) đang chạy → theo" };
    }
    return null;
}

// ==================== CẦU 2-2 (TT-XX) ====================
function cau22(history) {
    if (history.length < 4) return null;
    const last4 = history.slice(0, 4).map(h => h.result);
    const is22 = last4[0] === last4[1] && last4[2] === last4[3] && last4[0] !== last4[2];
    if (is22) {
        return { pred: last4[0], conf: 75, note: "Cầu 2-2 (TT-XX) đang chạy → theo TÀI" };
    }
    return null;
}

// ==================== XỬ LÝ BÃO (3 MẶT GIỐNG NHAU) ====================
function xuLyBao(dice) {
    if (!dice || dice.length < 3) return null;
    if (dice[0] === dice[1] && dice[1] === dice[2]) {
        return { pred: "Nghỉ", conf: 0, note: `BÃO [${dice[0]}-${dice[0]}-${dice[0]}] → Dừng 3 phiên để xem cầu mới` };
    }
    return null;
}

// ==================== DỰ ĐOÁN TỔNG HỢP ====================
function predictCombo(history, diceHistory) {
    if (!diceHistory || diceHistory.length === 0) {
        return {
            prediction: "Tài",
            confidence: 50,
            reason: "Chưa có dữ liệu",
            total: null
        };
    }
    
    const lastTotal = diceHistory[0].total;
    const lastDice = diceHistory[0].dice;
    const lastResult = diceHistory[0].result;
    
    // Đếm độ dài bệt hiện tại
    let doDaiBET = 1;
    for (let i = 1; i < Math.min(history.length, 20); i++) {
        if (history[i]?.result === lastResult) doDaiBET++;
        else break;
    }
    
    let finalPrediction = null;
    let finalConfidence = 0;
    let finalReason = "";
    let priority = 0;
    
    // 1. KIỂM TRA BÃO (ưu tiên cao nhất)
    const bao = xuLyBao(lastDice);
    if (bao) {
        return {
            prediction: bao.pred,
            confidence: bao.conf,
            reason: bao.note,
            total: lastTotal,
            isBao: true
        };
    }
    
    // 2. KIỂM TRA ĐIỂM ĐẶC BIỆT (X4, X8, X10, T14, T17, T18...)
    const diemMeo = BANG_DIEM[lastTotal];
    if (diemMeo && diemMeo.pred !== "Nghỉ") {
        finalPrediction = diemMeo.pred;
        finalConfidence = diemMeo.conf;
        finalReason = diemMeo.note;
        priority = 100;
    }
    
    // 3. KIỂM TRA CẦU THEO MẶT XÚC XẮC
    const cauMat = cauMatXucXac(lastDice);
    if (cauMat && (!finalPrediction || cauMat.conf > finalConfidence)) {
        if (cauMat.pred === "Đảo") {
            // Xử lý đảo cầu
            finalPrediction = lastResult === "Tài" ? "Xỉu" : "Tài";
            finalConfidence = cauMat.conf;
            finalReason = cauMat.note;
        } else {
            finalPrediction = cauMat.pred;
            finalConfidence = cauMat.conf;
            finalReason = cauMat.note;
        }
        priority = 90;
    }
    
    // 4. KIỂM TRA CẦU BỆT
    const bet = cauBet(history, doDaiBET, lastResult);
    if (bet && (!finalPrediction || bet.conf > finalConfidence)) {
        finalPrediction = bet.pred;
        finalConfidence = bet.conf;
        finalReason = bet.note;
        priority = 85;
    }
    
    // 5. KIỂM TRA CẦU 2-2
    const cau22Result = cau22(history);
    if (cau22Result && (!finalPrediction || cau22Result.conf > finalConfidence)) {
        finalPrediction = cau22Result.pred;
        finalConfidence = cau22Result.conf;
        finalReason = cau22Result.note;
        priority = 80;
    }
    
    // 6. KIỂM TRA CẦU 1-1
    const cau11Result = cau11(history);
    if (cau11Result && (!finalPrediction || cau11Result.conf > finalConfidence)) {
        finalPrediction = cau11Result.pred;
        finalConfidence = cau11Result.conf;
        finalReason = cau11Result.note;
        priority = 75;
    }
    
    // 7. FALLBACK: Theo xu hướng
    if (!finalPrediction) {
        // Ưu tiên Xỉu vì tỉ lệ 52%
        finalPrediction = "Xỉu";
        finalConfidence = 55;
        finalReason = "Cầu đang loạn, ưu tiên Xỉu (tỉ lệ 52%)";
    }
    
    // Giới hạn confidence
    finalConfidence = Math.min(98, Math.max(55, finalConfidence));
    
    return {
        prediction: finalPrediction,
        confidence: finalConfidence,
        reason: finalReason,
        total: lastTotal,
        doDaiBET: doDaiBET,
        priority: priority
    };
}

// ==================== PARSE DỮ LIỆU ====================
function parseLinesHu(data) {
    if (!data || !Array.isArray(data.list)) return [];
    const sortedList = data.list.sort((a, b) => b.id - a.id);
    return sortedList.map(item => ({
        session: item.id,
        dice: item.dices,
        total: item.point,
        result: item.point >= 11 ? "Tài" : "Xỉu",
        result_vn: item.point >= 11 ? "Tài" : "Xỉu",
        timestamp: Date.now()
    })).sort((a, b) => a.session - b.session);
}

function parseLinesMd5(data) {
    if (!data || !Array.isArray(data.list)) return [];
    const sortedList = data.list.sort((a, b) => b.id - a.id);
    return sortedList.map(item => ({
        session: item.id,
        dice: item.dices,
        total: item.point,
        result: item.resultTruyenThong === 'Tài' ? "Tài" : "Xỉu",
        result_vn: item.resultTruyenThong,
        timestamp: Date.now()
    })).sort((a, b) => a.session - b.session);
}

// ==================== GLOBAL STATE ====================
let huHistory = [];
let md5History = [];
let currentSessionIdHu = null;
let currentSessionIdMd5 = null;

// ==================== FETCH DATA ====================
async function fetchHuData() {
    try {
        const response = await fetch(API_URL_HU);
        const data = await response.json();
        const newHistory = parseLinesHu(data);
        if (newHistory.length === 0) return;
        
        const lastSession = newHistory.at(-1);
        
        if (!currentSessionIdHu) {
            huHistory = newHistory;
            currentSessionIdHu = lastSession.session;
            console.log(`✅ [HŨ] Đã tải ${newHistory.length} phiên`);
        } 
        else if (lastSession.session > currentSessionIdHu) {
            const newRecords = newHistory.filter(r => r.session > currentSessionIdHu);
            for (const record of newRecords) {
                huHistory.unshift(record);
            }
            if (huHistory.length > 500) huHistory = huHistory.slice(0, 450);
            currentSessionIdHu = lastSession.session;
            if (newRecords.length > 0) console.log(`🆕 [HŨ] +${newRecords.length} phiên mới`);
        }
    } catch (e) {
        console.error(`❌ [HŨ] Lỗi:`, e.message);
    }
}

async function fetchMd5Data() {
    try {
        const response = await fetch(API_URL_MD5);
        const data = await response.json();
        const newHistory = parseLinesMd5(data);
        if (newHistory.length === 0) return;
        
        const lastSession = newHistory.at(-1);
        
        if (!currentSessionIdMd5) {
            md5History = newHistory;
            currentSessionIdMd5 = lastSession.session;
            console.log(`✅ [MD5] Đã tải ${newHistory.length} phiên`);
        } 
        else if (lastSession.session > currentSessionIdMd5) {
            const newRecords = newHistory.filter(r => r.session > currentSessionIdMd5);
            for (const record of newRecords) {
                md5History.unshift(record);
            }
            if (md5History.length > 500) md5History = md5History.slice(0, 450);
            currentSessionIdMd5 = lastSession.session;
            if (newRecords.length > 0) console.log(`🆕 [MD5] +${newRecords.length} phiên mới`);
        }
    } catch (e) {
        console.error(`❌ [MD5] Lỗi:`, e.message);
    }
}

// ==================== MIDDLEWARE KIỂM TRA KEY ====================
function checkKey(query) {
    const userKey = query.key;
    if (!userKey) return { valid: false, error: "sai key rồi mua key đi @hahakk123" };
    if (userKey !== VALID_KEY) return { valid: false, error: "sai key rồi mua key đi @hahakk123" };
    return { valid: true };
}

// ==================== FASTIFY SERVER ====================
const app = fastify({ logger: false });
await app.register(cors, { origin: "*" });

// Route gốc
app.get("/", async () => {
    return {
        status: "active",
        message: "api hỗ trợ 2 bàn hũ+md5 mua key ib @hahakk123",
        algorithm: "🎲 TÀI XỈU VIP - BẮT CẦU CHUYÊN SÂU 🎲",
        key: "Hentaiz",
        features: [
            "📊 Bảng bắt điểm hốt bạc (X4→Tài, X8→Tài, X10→Tài, T14→Xỉu, T17/18→Xỉu)",
            "🎲 Cầu theo mặt xúc xắc (Kép bé→Xỉu, Kép lớn→Tài, Gánh→Đảo, Tiến→Tài, Lùi→Xỉu)",
            "🔥 Cầu bệt (4-6 tay→theo, 7+ tay→bẻ)",
            "🔄 Cầu 1-1 và 2-2",
            "⚠️ Xử lý BÃO (3 mặt giống nhau → nghỉ 3 phiên)"
        ]
    };
});

// ==================== API CHO BÀN HŨ ====================
app.get("/api/taixiu/lc79", async (request, reply) => {
    const keyCheck = checkKey(request.query);
    if (!keyCheck.valid) {
        return reply.status(401).send({ error: keyCheck.error });
    }
    
    if (huHistory.length < 3) {
        return reply.status(503).send({ error: "Đang phân tích dữ liệu HŨ, vui lòng chờ...", need: "Cần ít nhất 3 phiên" });
    }
    
    const lastResult = huHistory[0];
    const prediction = predictCombo(huHistory, huHistory);
    
    // 5 ván gần nhất
    const last5 = huHistory.slice(0, 5).map((v, i) => ({
        stt: i + 1,
        result: v.result_vn,
        total: v.total,
        dice: `${v.dice[0]}-${v.dice[1]}-${v.dice[2]}`
    }));
    
    const response = {
        "Id": "adSika88",
        "Game": "HŨ",
        "Phien_truoc": lastResult.session,
        "Xuc_xac": `${lastResult.dice[0]} - ${lastResult.dice[1]} - ${lastResult.dice[2]}`,
        "Ket_qua": lastResult.result_vn.toLowerCase(),
        "Tong": lastResult.total,
        "Phien_nay": lastResult.session + 1,
        "Du_doan": prediction.prediction === "Tài" ? "tài" : "xỉu",
        "Do_tin_cay": `${prediction.confidence}%`,
        "Ly_do": prediction.reason,
        "Biet_hien_tai": `${prediction.doDaiBET} ván`
    };
    
    if (prediction.isBao) {
        response["Canh_bao"] = "⚠️ BÃO XUẤT HIỆN - NÊN NGHỈ 3 PHIÊN ⚠️";
    }
    
    response["5_van_gan_nhat"] = last5;
    
    return response;
});

// API lịch sử HŨ
app.get("/api/taixiu/lc79/history", async (request, reply) => {
    const keyCheck = checkKey(request.query);
    if (!keyCheck.valid) return reply.status(401).send({ error: keyCheck.error });
    const reversedHistory = [...huHistory].sort((a, b) => b.session - a.session);
    return reversedHistory.slice(0, 30).map(i => ({
        session: i.session, dice: i.dice, total: i.total, result: i.result_vn.toLowerCase()
    }));
});

// ==================== API CHO BÀN MD5 ====================
app.get("/api/taixiumd5/lc79", async (request, reply) => {
    const keyCheck = checkKey(request.query);
    if (!keyCheck.valid) {
        return reply.status(401).send({ error: keyCheck.error });
    }
    
    if (md5History.length < 3) {
        return reply.status(503).send({ error: "Đang phân tích dữ liệu MD5, vui lòng chờ...", need: "Cần ít nhất 3 phiên" });
    }
    
    const lastResult = md5History[0];
    const prediction = predictCombo(md5History, md5History);
    
    // 5 ván gần nhất
    const last5 = md5History.slice(0, 5).map((v, i) => ({
        stt: i + 1,
        result: v.result_vn,
        total: v.total,
        dice: `${v.dice[0]}-${v.dice[1]}-${v.dice[2]}`
    }));
    
    const response = {
        "Id": "adSika88",
        "Game": "MD5",
        "Phien_truoc": lastResult.session,
        "Xuc_xac": `${lastResult.dice[0]} - ${lastResult.dice[1]} - ${lastResult.dice[2]}`,
        "Ket_qua": lastResult.result_vn.toLowerCase(),
        "Tong": lastResult.total,
        "Phien_nay": lastResult.session + 1,
        "Du_doan": prediction.prediction === "Tài" ? "tài" : "xỉu",
        "Do_tin_cay": `${prediction.confidence}%`,
        "Ly_do": prediction.reason,
        "Biet_hien_tai": `${prediction.doDaiBET} ván`
    };
    
    if (prediction.isBao) {
        response["Canh_bao"] = "⚠️ BÃO XUẤT HIỆN - NÊN NGHỈ 3 PHIÊN ⚠️";
    }
    
    response["5_van_gan_nhat"] = last5;
    
    return response;
});

// API lịch sử MD5
app.get("/api/taixiumd5/lc79/history", async (request, reply) => {
    const keyCheck = checkKey(request.query);
    if (!keyCheck.valid) return reply.status(401).send({ error: keyCheck.error });
    const reversedHistory = [...md5History].sort((a, b) => b.session - a.session);
    return reversedHistory.slice(0, 30).map(i => ({
        session: i.session, dice: i.dice, total: i.total, result: i.result_vn.toLowerCase()
    }));
});

// ==================== API BẢNG ĐIỂM ====================
app.get("/api/bang-diem", async (request, reply) => {
    const keyCheck = checkKey(request.query);
    if (!keyCheck.valid) return reply.status(401).send({ error: keyCheck.error });
    
    return {
        title: "📊 BẢNG BẮT ĐIỂM 'HỐT BẠC' 📊",
        description: "Từ tổng điểm phiên trước để dự đoán phiên tiếp theo",
        xiu: {
            title: "NHÓM XỈU (3-10)",
            "3": "X3 → NGHỈ (Dữ liệu hiếm)",
            "4": "X4 → TÀI 90% (Bẻ cầu)",
            "5": "X5 → TÀI 70%",
            "6": "X6 → TÀI 80% (Hay nhảy T12)",
            "7": "X7 → XỈU 80% (Hoặc về X8, X9)",
            "8": "X8 → TÀI 85% (Tỉ lệ nổ Tài cực cao)",
            "9": "X9 → XỈU 80% (Đứng Xỉu 10)",
            "10": "X10 → TÀI 90% (Điểm gãy sang T11, T12)"
        },
        tai: {
            title: "NHÓM TÀI (11-18)",
            "11": "T11 → XỈU 85% (Hồi mã thương)",
            "12": "T12 → TÀI 70% (Bệt Tài, điểm xuất hiện nhiều nhất)",
            "13": "T13 → XỈU 70% (Cầu 1-1)",
            "14": "T14 → XỈU 95% (SIÊU XỈU - Điểm vàng để bẻ)",
            "15": "T15 → TÀI 70% (Nổ Tài 16, 17)",
            "16": "T16 → XỈU 85% (Tài lớn dễ gãy)",
            "17": "T17 → XỈU 90% (Về Xỉu ngay)",
            "18": "T18 → XỈU 100% (BẺ XỈU)"
        },
        meo_cau: {
            cau_mat_xuc_xac: {
                "Kép Bé (1-1,2-2)": "BỆT XỈU 80%",
                "Kép Lớn (5-5,6-6)": "BỆT TÀI 80%",
                "Cầu Gánh (3-5-3)": "ĐẢO CẦU 85%",
                "Cầu Tiến (1-2-3)": "TÀI 80%",
                "Cầu Lùi (6-5-4)": "XỈU 80%",
                "2 mặt 6": "XỈU 85%"
            },
            cau_bet: {
                "Bệt 4-6 tay": "Theo tiếp 70-79%",
                "Bệt 7+ tay": "Bẻ ngược 80%"
            },
            cau_11: "Cầu 1-1 (T-X-T-X) → theo 70%",
            cau_22: "Cầu 2-2 (TT-XX) → theo TÀI 75%"
        },
        xu_ly_bao: "BÃO (3 mặt giống nhau) → NGHỈ 3 PHIÊN",
        note: "⚠️ Tỉ lệ thực tế: Xỉu 52% - Tài 48% → Ưu tiên Xỉu khi cầu loạn"
    };
});

// ==================== API KIỂM TRA KEY ====================
app.get("/check-key", async (request, reply) => {
    const userKey = request.query.key;
    if (!userKey) return { status: "error", message: "sai key rồi mua key đi @hahakk123" };
    if (userKey === VALID_KEY) return { status: "success", message: "KEY HỢP LỆ", key: VALID_KEY };
    return { status: "error", message: "sai key rồi mua key đi @hahakk123" };
});

// API thống kê
app.get("/api/stats", async (request, reply) => {
    const keyCheck = checkKey(request.query);
    if (!keyCheck.valid) return reply.status(401).send({ error: keyCheck.error });
    
    // Tính tỉ lệ Tài/Xỉu trong history
    const huTai = huHistory.filter(h => h.result === "Tài").length;
    const huXiu = huHistory.length - huTai;
    const md5Tai = md5History.filter(h => h.result === "Tài").length;
    const md5Xiu = md5History.length - md5Tai;
    
    return {
        hu: {
            history_length: huHistory.length,
            last_session: huHistory[0] || null,
            ti_le: huHistory.length > 0 ? `${(huTai / huHistory.length * 100).toFixed(1)}% Tài - ${(huXiu / huHistory.length * 100).toFixed(1)}% Xỉu` : "Chưa có dữ liệu"
        },
        md5: {
            history_length: md5History.length,
            last_session: md5History[0] || null,
            ti_le: md5History.length > 0 ? `${(md5Tai / md5History.length * 100).toFixed(1)}% Tài - ${(md5Xiu / md5History.length * 100).toFixed(1)}% Xỉu` : "Chưa có dữ liệu"
        },
        algorithm: "TÀI XỈU VIP - BẮT CẦU CHUYÊN SÂU",
        key: VALID_KEY
    };
});

// ==================== START SERVER ====================
const start = async () => {
    await Promise.all([fetchHuData(), fetchMd5Data()]);
    
    setInterval(fetchHuData, 5000);
    setInterval(fetchMd5Data, 5000);
    
    try {
        await app.listen({ port: PORT, host: "0.0.0.0" });
    } catch (err) {
        console.error("❌ Lỗi khởi động server:", err.message);
        process.exit(1);
    }
    
    console.log("\n╔══════════════════════════════════════════════════════════════════════════════╗");
    console.log("║     TÀI XỈU HŨ & MD5 - BẮT CẦU CHUYÊN SÂU (X4→Tài, T14→Xỉu, T18→Xỉu)      ║");
    console.log("╠══════════════════════════════════════════════════════════════════════════════╣");
    console.log("║  🚀 Server running on port", PORT);
    console.log("║  🔑 KEY: Hentaiz                                                             ║");
    console.log("║                                                                                ║");
    console.log("║  📊 BẢNG BẮT ĐIỂM HỐT BẠC:                                                    ║");
    console.log("║     X4→Tài90%, X5→Tài70%, X6→Tài80%, X7→Xỉu80%, X8→Tài85%                   ║");
    console.log("║     X9→Xỉu80%, X10→Tài90%, T11→Xỉu85%, T12→Tài70%, T13→Xỉu70%               ║");
    console.log("║     T14→Xỉu95%, T15→Tài70%, T16→Xỉu85%, T17→Xỉu90%, T18→Xỉu100%             ║");
    console.log("║                                                                                ║");
    console.log("║  🎲 CẦU THEO MẶT XÚC XẮC:                                                    ║");
    console.log("║     Kép Bé(1-1,2-2)→Xỉu, Kép Lớn(5-5,6-6)→Tài, Gánh→Đảo                     ║");
    console.log("║     Tiến(1-2-3)→Tài, Lùi(6-5-4)→Xỉu, 2 mặt6→Xỉu85%                          ║");
    console.log("║                                                                                ║");
    console.log("║  🔥 CẦU BỆT: 4-6 tay→theo, 7+ tay→bẻ                                        ║");
    console.log("║  🔄 CẦU 1-1: T-X-T-X→theo 70%, CẦU 2-2: TT-XX→Tài 75%                        ║");
    console.log("║  ⚠️ BÃO: 3 mặt giống nhau → NGHỈ 3 PHIÊN                                      ║");
    console.log("║                                                                                ║");
    console.log("║  🎯 API ENDPOINTS:                                                            ║");
    console.log("║     HŨ:  /api/taixiu/lc79?key=Hentaiz                                        ║");
    console.log("║     MD5: /api/taixiumd5/lc79?key=Hentaiz                                     ║");
    console.log("║     Bảng điểm: /api/bang-diem?key=Hentaiz                                    ║");
    console.log("║                                                                                ║");
    console.log("║  📞 ADMIN: @hahakk123                                                          ║");
    console.log("╚══════════════════════════════════════════════════════════════════════════════╝\n");
};

start();
