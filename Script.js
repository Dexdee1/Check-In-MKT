const API_URL = "https://script.google.com/macros/s/AKfycbxyRQXYyyxFEVjS95dRxJtcA-aRjmqNueiT64ul00h5R-whgIp54BOA1c2W2jABGGpIoQ/exec";
const COOLDOWN_MINUTES = 3; 
let selectedShiftName = "";
let employeesData = [];
let locationsData = [];
let isProcessing = false;
let isRefreshingData = false;
let datesSet1 = [];
let datesSet2 = [];
let currentLeaveType = "";

// --- 1. เริ่มต้นระบบ ---
window.onload = () => {
    fetchInitialData();
    loadRecentActivities();
    setInterval(loadRecentActivities, 15000); 
};

// ดึงข้อมูลรายชื่อและสถานที่เริ่มต้น
async function fetchInitialData() {
    if (isRefreshingData) return;
    isRefreshingData = true;

    const empEl = document.getElementById('empList');
    const locEl = document.getElementById('locList');

    try {
        const res = await fetch(API_URL + "?action=getData&t=" + new Date().getTime());
        const data = await res.json();

        if (data.employees && Array.isArray(data.employees)) {
            employeesData = data.employees;
            localStorage.setItem('cachedEmployees', JSON.stringify(data.employees));
            populateEmployeeList();
        }

        if (data.locations && Array.isArray(data.locations)) {
            locationsData = data.locations;
            localStorage.setItem('cachedLocations', JSON.stringify(data.locations));
            populateLocationList();
        }

    } catch (e) {
        console.error("Fetch Error:", e);
        const storedEmp = localStorage.getItem('cachedEmployees');
        if (storedEmp) {
            employeesData = JSON.parse(storedEmp);
            populateEmployeeList();
        } else if (empEl) {
            empEl.innerHTML = '<option value="">❌ โหลดไม่สำเร็จ ลองรีเฟรชใหม่</option>';
        }
    } finally {
        isRefreshingData = false;
    }
}

// สร้างรายการพนักงานลงใน Select (แก้ไขระบบเรียงลำดับตัวเลข 1-100)
function populateEmployeeList() {
    const empEl = document.getElementById('empList');
    if (!empEl || !employeesData || employeesData.length === 0) return;

    // ดึงรายชื่อที่ไม่ซ้ำกัน
    const uniqueEmployees = [...new Set(employeesData.map(e => (typeof e === 'string' ? e : e.name || "")).filter(Boolean))];
    
    // --- จุดที่แก้ไข: ระบบเรียงลำดับแบบตัวเลข ---
    uniqueEmployees.sort((a, b) => {
        // ดึงตัวเลขข้างหน้าชื่อออกมา (เช่น "10. สา" จะได้ 10)
        const numA = parseInt(a.match(/^\d+/));
        const numB = parseInt(b.match(/^\d+/));

        // ถ้ามีตัวเลขทั้งคู่ ให้เทียบกันแบบตัวเลข
        if (!isNaN(numA) && !isNaN(numB)) {
            return numA - numB;
        }
        // ถ้าไม่มีตัวเลข ให้เรียงตามตัวอักษรปกติ
        return a.localeCompare(b, 'th');
    });

    let html = '<option value="">-- เลือกพนักงาน --</option>';
    uniqueEmployees.forEach(name => {
        html += `<option value="${name}">${name}</option>`;
    });

    empEl.innerHTML = html;
    empEl.disabled = false;
}

// สร้างรายการสถานที่ลงใน Select
function populateLocationList() {
    const locEl = document.getElementById('locList');
    if (!locEl || !locationsData || locationsData.length === 0) return;

    const uniqueLoc = [...new Set(locationsData.filter(Boolean))];
    uniqueLoc.sort();

    let html = '<option value="">-- เลือกเว็บที่ทำงาน --</option>';
    uniqueLoc.forEach(loc => {
        html += `<option value="${loc}">${loc}</option>`;
    });

    locEl.innerHTML = html;
    locEl.disabled = false;
}

// --- 2. จัดการกิจกรรมล่าสุด ---
async function loadRecentActivities() {
    const loadingStatus = document.getElementById('loadingStatus');
    if (!loadingStatus) return;

    loadingStatus.classList.remove('hidden');

    try {
        const res = await fetch(API_URL + "?action=getRecent&t=" + new Date().getTime());
        const data = await res.json();

        if (data && Array.isArray(data.recent)) {
            renderActivities(data.recent);
        }
    } catch (e) {
        console.error("Error loading activities:", e);
    } finally {
        loadingStatus.classList.add('hidden');
    }
}

function renderActivities(recentActivities) {
    const activityContainer = document.getElementById('recentActivityList'); 
    if (!activityContainer) return;

    if (!recentActivities || recentActivities.length === 0) {
        activityContainer.innerHTML = '<div class="p-6 text-center text-slate-400 italic text-xs">ไม่พบข้อมูลกิจกรรมล่าสุด</div>';
        return;
    }

    const sortedActivities = [...recentActivities].sort((a, b) => b.timestamp - a.timestamp);
    const limitedActivities = sortedActivities.slice(0, 5);

    activityContainer.innerHTML = limitedActivities.map(activity => {
        const isCheckOut = activity.type.includes('ออกงาน');
        const typeStyle = activity.type.includes('เข้างาน') ? 'text-emerald-500 bg-emerald-50' : 
                         isCheckOut ? 'text-rose-500 bg-rose-50' : 'text-blue-500 bg-blue-50';
        
        // --- ส่วนที่เพิ่มการดึงวันที่มาแสดงผล ---
        // ปกติ Google Script จะส่งวันที่มาในรูปแบบที่ดึง timestamp ได้
        const dateObj = new Date(activity.timestamp);
        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dateDisplay = `${day}/${month}`; // แสดงผลเป็น 02/05[cite: 2]

        let extraInfo = "";
        if (activity.note && activity.note !== "-") {
            extraInfo += `<div class="text-[10px] text-slate-500 mt-1 font-medium bg-slate-100/50 px-2 py-0.5 rounded-md inline-block">📝 ${activity.note}</div>`;
        }
        if (isCheckOut && activity.duration) {
            extraInfo += `<div class="text-[10px] text-blue-600 font-black mt-1 flex items-center gap-1">⏱️ ทำงานไป: ${activity.duration}</div>`;
        }

        return `
            <div class="activity-item p-4 flex justify-between items-start border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                <div class="flex flex-col flex-1 pr-2">
                    <span class="text-[14px] font-black text-slate-800 italic uppercase leading-tight">${activity.name}</span>
                    <div class="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">
                        📍 ${activity.loc} <span class="mx-1">|</span> ⏳ ${activity.shift}
                    </div>
                    ${extraInfo}
                </div>
                <div class="text-right flex flex-col items-end">
                    <span class="inline-block px-3 py-1 rounded-lg text-[9px] font-black uppercase italic mb-1 ${typeStyle}">${activity.type}</span>
                    <!-- แสดงวันที่ควบคู่กับเวลาเพื่อความละเอียด[cite: 2] -->
                    <div class="text-[10px] font-black text-slate-400 italic">${dateDisplay} | ${activity.time}</div>
                </div>
            </div>
        `;
    }).join('');
}

// --- 3. ส่วนจัดการการบันทึกข้อมูล ---
function checkShiftWindow(action) {
    const now = new Date();
    const time = now.getHours() + (now.getMinutes() / 60);
    let start, end;
    if (selectedShiftName === "กะเช้า") {
        if (action === "เข้างาน") { start = 6.0; end = 10.0; } 
        else { start = 18.0; end = 22.0; } 
    } else if (selectedShiftName === "กะดึก") {
        if (action === "เข้างาน") { start = 18.0; end = 22.0; } 
        else { start = 6.0; end = 10.0; } 
    } else return "NO_SHIFT";
    
    return (time < start) ? "BEFORE" : (time > end) ? "AFTER" : "OK";
}

function handleAction(type) {
    if (isProcessing) return;
    const name = document.getElementById('empList').value;
    const loc = document.getElementById('locList').value;

    if (!name || !loc || !selectedShiftName) {
        return showModernToast("ข้อมูลไม่ครบ", "กรุณาเลือกพนักงาน เว็บ และกะงานให้ครบค่ะ", "⚠️", false);
    }

    const status = checkShiftWindow(type);
    if (status === "BEFORE") return showModernToast("ยังไม่ถึงเวลา", `ช่วง ${type} ยังไม่เปิดค่ะ`, "⏳", false);
    if (status === "AFTER") return showModernToast("เกินเวลา", `เสียใจด้วย! เกินกำหนดแจ้ง ${type} แล้วค่ะ`, "❌", false);
    
    const lastTime = localStorage.getItem(`last_${name}_${type}`);
    if (lastTime) {
        const diff = (new Date() - new Date(lastTime)) / 60000;
        if (diff < COOLDOWN_MINUTES) return showModernToast("บันทึกซ้ำ!", `รออีก ${Math.ceil(COOLDOWN_MINUTES - diff)} นาที`, "⏳", false);
    }
    
    const timeData = getSmartTimeNote(type, selectedShiftName);
    executeSubmit(name, loc, type, selectedShiftName, timeData.note, true);
}

function getSmartTimeNote(type, shift) {
    const now = new Date(); 
    const cur = (now.getHours() * 60) + now.getMinutes();
    let target = (type === 'เข้างาน') ? (shift === 'กะเช้า' ? 480 : 1200) : (shift === 'กะเช้า' ? 1200 : 480);
    let diff = cur - target; 
    if (diff > 720) diff -= 1440; 
    if (diff < -720) diff += 1440;
    const label = diff > 0 ? 'ช้า' : 'ก่อน';
    return { note: `${type}${label} ${Math.abs(diff)} นาที` };
}

async function executeSubmit(name, loc, type, shift, noteValue, saveCool) {
    isProcessing = true;
    setFormDisabled(true);
    showModernToast("กำลังบันทึก...", `${type}ลงบันทึกแล้ว...`, "⏳", false);

    try {
        const res = await fetch(API_URL, { 
            method: "POST", 
            body: JSON.stringify({ name, location: loc, type, shift, note: noteValue }) 
        });
        const data = await res.json();
        if (data.status === "success") {
            if (saveCool) localStorage.setItem(`last_${name}_${type}`, new Date().toISOString());
            let msg = `${type}สำเร็จ!`;
            if (data.duration) msg += `<br><b class="text-blue-600">⏱️ รวมเวลา: ${data.duration}</b>`;
            showModernToast("สำเร็จ!", msg, "✅", true);
        } else {
            showModernToast("ข้อผิดพลาด", data.message || 'บันทึกไม่สำเร็จ', "❌", false);
        }
    } catch (e) {
        showModernToast("ข้อผิดพลาดเครือข่าย", "กรุณาลองใหม่อีกครั้ง", "⚠️", false);
    } finally {
        isProcessing = false;
        setFormDisabled(false);
        loadRecentActivities();
    }
}

// --- 4. UI Helpers ---
function selectShift(btn, name) {
    document.querySelectorAll('.shift-btn').forEach(b => b.classList.remove('shift-active'));
    btn.classList.add('shift-active'); 
    selectedShiftName = name;
}

function setFormDisabled(disabled) {
    document.querySelectorAll('#empList, #locList, .shift-btn, button').forEach(el => {
        el.disabled = disabled;
    });
}

function showRulePopup() {
    const rules = [
        "1. เข้ามาสายนาทีละ 5.-",
        "2. ลืมแจ้งเข้างาน 400.- /ครั้ง",
        "3. ลืมแจ้งออก 250.- /ครั้ง",
        "* กะเช้า 08:00 - 20:00",
        "* กะดึก 20:00 - 08:00",
        "* แจ้งเข้า-ออกงานได้ก่อน/หลังเวลาที่กำหนด 1 ชั่วโมง"
    ];
    showModernToast("กฎระเบียบ", `<div class='text-left text-xs bg-slate-50 p-4 rounded-2xl'>${rules.map(r=>`<div>${r}</div>`).join('')}</div>`, "📋", false);
}

function showModernToast(title, msg, icon, auto) {
    const t = document.getElementById('appToast');
    if(!t) return;
    document.getElementById('toastIcon').innerText = icon; 
    document.getElementById('toastTitle').innerText = title; 
    document.getElementById('toastMsg').innerHTML = msg;
    t.classList.remove('hidden');
    if (auto) {
        setTimeout(() => location.reload(), 2500);
    }
}

function closeToast() { document.getElementById('appToast').classList.add('hidden'); }

// --- ส่วนจัดการการลา ---
function handleLeave(btn, type) {
    const name = document.getElementById('empList').value;
    if (!name) return alert("กรุณาเลือกชื่อพนักงานก่อนค่ะ");
    currentLeaveType = type; 
    datesSet1 = []; datesSet2 = []; 
    renderDateTags();
    document.getElementById('leaveModalTitle').innerText = "รายการ: " + type;
    document.getElementById('leaveModal').classList.remove('hidden');
}

function addDateToList(num) {
    const input = document.getElementById(`dateInput${num}`);
    if (!input || !input.value) return;
    const target = (num === 1) ? datesSet1 : datesSet2;
    if (!target.includes(input.value)) { 
        target.push(input.value); 
        renderDateTags(); 
    }
    input.value = "";
}

function renderDateTags() {
    document.getElementById('dateListDisplay1').innerHTML = datesSet1.map(d => `<span class="date-tag">${d}</span>`).join('');
    document.getElementById('dateListDisplay2').innerHTML = datesSet2.map(d => `<span class="date-tag">${d}</span>`).join('');
}

function closeLeaveModal() { document.getElementById('leaveModal').classList.add('hidden'); }

async function confirmLeaveSubmit() {
    if (datesSet1.length === 0) return alert("เลือกวันที่ก่อนค่ะ");
    const name = document.getElementById('empList').value;
    const finalNote = `[${currentLeaveType}] ${datesSet1.join(', ')}`;
    executeSubmit(name, "-", currentLeaveType, selectedShiftName || "-", finalNote, false);
    closeLeaveModal();
}