// --- ⚙️ ตั้งค่าพื้นฐาน ---
const SPREADSHEET_ID = "1CzdemJK9Rch9k96Wbn9p8475xOrOnVrPXj4CjiuTKnY";
const SHEET_EMP = "พนักงาน";   
const SHEET_LOC = "ที่ทำงาน";  
const SHEET_CHECKIN = "CheckIn";
const SHEET_RULES = "กฎระเบียบ"; 

// ตั้งค่า Telegram
const TELEGRAM_TOKEN = "8706607367:AAG1O7QXXj9xKX0Lf7jRgnGKkCAf7-7j4So"; 
const TELEGRAM_CHAT_ID = "-5251625156"; 

// --- 🔵 ฟังก์ชันดึงข้อมูล (GET) ---
function doGet(e) {
  try {
    const action = e.parameter.action;
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheetCheckIn = ss.getSheetByName(SHEET_CHECKIN);

    if (action === "getData" || action === "getRecent") {
      const empSheet = ss.getSheetByName(SHEET_EMP);
      const locSheet = ss.getSheetByName(SHEET_LOC);
      
      const employees = empSheet ? empSheet.getRange("A2:A" + empSheet.getLastRow()).getValues().flat().filter(String) : [];
      const locations = locSheet ? locSheet.getRange("A2:A" + locSheet.getLastRow()).getValues().flat().filter(String) : [];
      
      let recent = [];
      let todayCheckinCount = 0;
      if (sheetCheckIn && sheetCheckIn.getLastRow() > 1) {
        const lastRow = sheetCheckIn.getLastRow();
        const lastCol = sheetCheckIn.getLastColumn();
        const rows = sheetCheckIn.getRange(2, 1, lastRow - 1, lastCol).getValues();
        const timezone = "GMT+7";
        const today = Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd");

        const validRows = rows
          .filter(r => r[0] && r[1])
          .map(r => ({
            time: new Date(r[0]),
            name: r[1],
            loc: r[2] || "",
            type: r[3] || "",
            shift: r[4] || "-",
            note: r[5] || "",
            duration: r[6] || ""
          }))
          .filter(r => !isNaN(r.time.getTime()));

        // ดึง 10 รายการล่าสุด (จัดเรียงไว้เป็นเก่าอยู่บน ใหม่อยู่ล่าง)
        recent = validRows
          .sort((a, b) => a.time - b.time)  // time ascending
          .slice(Math.max(0, validRows.length - 10)) // take last 10 if >10
          .map(r => ({
            time: Utilities.formatDate(r.time, timezone, "HH:mm น."),
            name: r.name,
            loc: r.loc,
            type: r.type,
            shift: r.shift,
            note: r.note,
            duration: r.duration,
            timestamp: r.time.getTime()
          }));

        const todayCheckinNames = validRows
          .filter(r => r.type === "เข้างาน" && Utilities.formatDate(r.time, timezone, "yyyy-MM-dd") === today)
          .map(r => r.name.toString().trim())
          .filter(Boolean);

        todayCheckinCount = [...new Set(todayCheckinNames)].length;
      }

      return resJson({ 
        employees: employees, 
        locations: locations, 
        recent: recent,
        todayCheckinCount: todayCheckinCount
      });
    }

    if (action === "getIndividual" || action === "getUserHistory") {
      const targetName = e.parameter.name;
      if (!sheetCheckIn || !targetName) return resJson({ history: [] });
      const rows = sheetCheckIn.getDataRange().getValues();
      rows.shift(); 
      const history = rows.filter(row => row[1] == targetName)
        .map(row => ({
          date: Utilities.formatDate(new Date(row[0]), "GMT+7", "dd/MM/yy"),
          time: Utilities.formatDate(new Date(row[0]), "GMT+7", "HH:mm"),
          datetime: new Date(row[0]).getTime(),
          name: row[1],
          location: row[2],
          type: row[3],
          shift: row[4],
          note: row[5],
          duration: row[6] || ""
        }))
        .sort((a, b) => a.datetime - b.datetime); // เก่าสุดอยู่บน, ใหม่สุดอยู่ล่าง
      return resJson({ history: history });
    }
  } catch(err) { 
    return resJson({ error: err.toString() }); 
  }
}

// --- 🟢 ฟังก์ชันบันทึกข้อมูล (POST) ---
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_CHECKIN);
    const now = new Date(); 
    let workDuration = ""; 

    // คำนวณเวลาทำงานกรณี "ออกงาน"
    if (data.type === "ออกงาน") {
      const rows = sheet.getDataRange().getValues();
      for (let i = rows.length - 1; i >= 1; i--) {
        if (rows[i][1] === data.name && rows[i][3] === "เข้างาน") {
          const lastInTime = new Date(rows[i][0]);
          const diffMs = now - lastInTime;
          const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
          const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
          workDuration = diffHrs + " ชม. " + diffMins + " นาที";
          break;
        }
      }
    }

    // บันทึกลง Google Sheet
    // ลำดับ: [วันที่เวลา, ชื่อ, สถานที่, ประเภท, กะ, หมายเหตุ, รวมเวลา]
    sheet.appendRow([
      now, 
      data.name, 
      data.location || "-", 
      data.type, 
      data.shift || "-", 
      data.note || "-", 
      workDuration
    ]);
    
    // ส่งแจ้งเตือนเข้า Telegram
    sendTelegram(data, now, workDuration);
    
    return resJson({ status: "success", duration: workDuration });
  } catch (err) { 
    return resJson({ status: "error", message: err.toString() }); 
  }
}

// --- 🛠️ ฟังก์ชันส่ง Telegram ---
function sendTelegram(data, time, duration) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;
  
  const timeStr = Utilities.formatDate(time, "GMT+7", "HH:mm น.");
  const dateStr = Utilities.formatDate(time, "GMT+7", "dd/MM/yyyy");
  
  // ตกแต่งข้อความให้น่าอ่าน
  let msg = `🔔 *แจ้งเตือนระบบ WORK SMART*\n`;
  msg += `────────────────\n`;
  msg += `👤 *พนักงาน:* ${data.name}\n`;
  msg += `🌐 *เว็น:* ${data.location || "-"}\n`;
  msg += `🚀 *กะทำงาน:* ${data.shift || "-"}\n`;
  msg += `♻️ *ประเภท:* ${data.type}\n`;
  msg += `⏰ *เวลากดแจ้ง:* ${timeStr} (${dateStr})\n`;
  
  
  if (duration) {
    msg += `⏳ *วันนี้ทำงานไป:* ${duration}\n`;
  }
  
  if (data.note && data.note !== "-") {
    msg += `────────────────\n`;
    msg += `✅ *รายละเอียด:* ${data.note}`;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  try {
    UrlFetchApp.fetch(url, {
      method: "post",
      payload: {
        chat_id: TELEGRAM_CHAT_ID,
        text: msg,
        parse_mode: "Markdown"
      },
      muteHttpExceptions: true
    });
  } catch (e) {
    console.error("Telegram Error: " + e.toString());
  }
}

function resJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}