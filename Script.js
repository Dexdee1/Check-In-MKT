const API_URL = "https://script.google.com/macros/s/AKfycbxyRQXYyyxFEVjS95dRxJtcA-aRjmqNueiT64ul00h5R-whgIp54BOA1c2W2jABGGpIoQ/exec";
const COOLDOWN_MINUTES = 3; 
let selectedShiftName = "";
let selectedDepartment = "";
let employeesData = [];
let employeesByDepartment = {};
let departments = [];
let locationsData = [];
let isProcessing = false;
let isRefreshingData = false;
let isRefreshingRecent = false;
let datesSet1 = [];
let datesSet2 = [];
let currentLeaveType = "";

// fixed enum employee list (ถ้าต้องการกำหนดค่าตายตัว สามารถแก้ได้ที่นี่)
const EMPLOYEE_ENUM = [
    'ศรี','บุญมา','สกลิ','อานน','ต้นตาล','หมิว','แจ๊ค'
];

// --- 1. เริ่มต้นระบบ ---
window.onload = () => {
    // โหลดข้อมูลพนักงานและเว็บเพียงครั้งเดียว
    fetchInitialData();
    loadRecentActivities();

    // รีเฟรชเฉพาะหน้ารายการล่าสุดทุก 5 วินาที
    setInterval(loadRecentActivities, 5000);
};

async function fetchInitialData() {
    if (isRefreshingData) return;
    isRefreshingData = true;

    const empEl = document.getElementById('empList');
    const locEl = document.getElementById('locList');

    // แสดงสถานะระหว่างรอก่อน
    if (empEl) empEl.innerHTML = '<option value="">-- กำลังโหลดพนักงาน... --</option>';
    if (locEl) locEl.innerHTML = '<option value="">-- กำลังโหลดเว็บที่ทำงาน... --</option>';

    // โหลดจาก cache localStorage ก่อน ถ้ามี
    try {
        const storedEmp = localStorage.getItem('cachedEmployees');
        const storedLoc = localStorage.getItem('cachedLocations');

        if (storedEmp) {
            const cached = JSON.parse(storedEmp);
            if (Array.isArray(cached) && cached.length > 0) {
                employeesData = cached;
                populateEmployeeList();
            }
        }

        if (storedLoc) {
            const cached = JSON.parse(storedLoc);
            if (Array.isArray(cached) && cached.length > 0) {
                locationsData = cached;
                populateLocationList();
            }
        }
    } catch (cacheErr) {
        console.warn('LocalStorage ยังไม่พร้อมหรือข้อมูลไม่ถูกต้อง', cacheErr);
    }

    // ใช้ emoji enum หากตั้งค่าไว้ ให้ทันที
    if ((!employeesData || employeesData.length === 0) && EMPLOYEE_ENUM && EMPLOYEE_ENUM.length > 0) {
        employeesData = EMPLOYEE_ENUM.slice();
        populateEmployeeList();
    }

    try {
        const res = await fetch(API_URL + "?action=getData");
        const data = await res.json();

        // อัปเดตหาก API กลับมาข้อมูลใหม่
        if (!EMPLOYEE_ENUM || EMPLOYEE_ENUM.length === 0) {
            employeesData = data.employees || [];
        }
        locationsData = data.locations || [];

        populateEmployeeList();
        populateLocationList();
        renderActivities(data.recent);

        // แคชเพื่อโหลดเร็วในครั้งถัดไป
        if (Array.isArray(data.employees) && data.employees.length > 0) {
            localStorage.setItem('cachedEmployees', JSON.stringify(data.employees));
        }
        if (Array.isArray(data.locations) && data.locations.length > 0) {
            localStorage.setItem('cachedLocations', JSON.stringify(data.locations));
        }
    } catch (e) {
        console.error("Fetch Error:", e);

        if (employeesData && employeesData.length > 0) {
            populateEmployeeList();
        } else if (empEl) {
            empEl.innerHTML = '<option value="">❌ โหลดพนักงานไม่สำเร็จ</option>';
        }

        if (locEl && (!locationsData || locationsData.length === 0)) {
            locEl.innerHTML = '<option value="">❌ โหลดเว็บที่ทำงานไม่สำเร็จ</option>';
        }
    } finally {
        isRefreshingData = false;
    }
}



function onDepartmentChange(department) {
    // No longer used - departments removed from UI
}

let cachedEmployeeOptions = null;

function populateEmployeeList() {
    const empEl = document.getElementById('empList');
    if (!empEl) return;

    if (cachedEmployeeOptions) {
        empEl.innerHTML = cachedEmployeeOptions;
        empEl.disabled = false;
        return;
    }

    // Get all unique employees from all departments or enum/API
    let allEmployees = [];

    if (Object.keys(employeesByDepartment).length > 0) {
        Object.values(employeesByDepartment).forEach(deptEmployees => {
            allEmployees = allEmployees.concat(deptEmployees);
        });
    } else if (employeesData.length > 0) {
        allEmployees = employeesData
            .map(emp => {
                if (typeof emp === 'string') return emp.trim();
                if (typeof emp === 'object' && emp !== null) return (emp.name || emp.employee || emp.label || "").toString().trim();
                return "";
            })
            .filter(Boolean);
    }

    allEmployees = [...new Set(allEmployees)];

    if (allEmployees.length === 0) {
        empEl.innerHTML = '<option value="">-- ไม่มีข้อมูลพนักงาน --</option>';
        cachedEmployeeOptions = empEl.innerHTML;
        empEl.disabled = false;
        return;
    }

    allEmployees.sort();
    const fragment = document.createDocumentFragment();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '-- เลือกพนักงาน --';
    fragment.appendChild(placeholder);

    for (const name of allEmployees) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        fragment.appendChild(option);
    }

    empEl.innerHTML = '';
    empEl.appendChild(fragment);
    empEl.disabled = false;

    // Cache markup for next reuse
    cachedEmployeeOptions = empEl.innerHTML;
}

function setFormDisabled(disabled) {
    document.querySelectorAll('#empList, #locList, .shift-btn, button[onclick="handleAction(\'เข้างาน\')"], button[onclick="handleAction(\'ออกงาน\')"]').forEach(el => {
        if (el.tagName === 'BUTTON') {
            el.disabled = disabled;
            el.style.opacity = disabled ? '0.6' : '1';
            el.style.cursor = disabled ? 'not-allowed' : 'pointer';
        } else {
            el.disabled = disabled;
        }
    });
}

function populateLocationList() {
    const locEl = document.getElementById('locList');
    if (!locEl) return;

    if (!locationsData || locationsData.length === 0) {
        locEl.innerHTML = '<option value="">-- ไม่มีข้อมูลเว็บที่ทำงาน --</option>';
        return;
    }

    if (locEl.dataset.cached === '1') {
        locEl.disabled = false;
        return;
    }

    const uniqueLoc = [...new Set(locationsData.map(loc => (loc || "").toString().trim()).filter(Boolean))];
    uniqueLoc.sort();

    const fragment = document.createDocumentFragment();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '-- เลือกเว็บที่ทำงาน --';
    fragment.appendChild(placeholder);

    for (const w of uniqueLoc) {
        const option = document.createElement('option');
        option.value = w;
        option.textContent = w;
        fragment.appendChild(option);
    }

    locEl.innerHTML = '';
    locEl.appendChild(fragment);
    locEl.dataset.cached = '1';
    locEl.disabled = false;
}


function selectEmployee(button) {
    const name = decodeURIComponent(button.dataset.name || '');
    const empEl = document.getElementById('empList');
    if (!empEl || !name) return;

    empEl.value = name;
}

function getEmployeeColorClass(name) {
    const cleanName = name.replace(/^\d+\.\s*/, '').trim();
    const char = cleanName.charAt(0) || name.charAt(0) || 'A';
    const colors = [
        'bg-sky-100 text-sky-700',
        'bg-rose-100 text-rose-700',
        'bg-emerald-100 text-emerald-700',
        'bg-violet-100 text-violet-700',
        'bg-orange-100 text-orange-700',
        'bg-amber-100 text-amber-700',
        'bg-cyan-100 text-cyan-700',
        'bg-lime-100 text-lime-700',
        'bg-pink-100 text-pink-700',
        'bg-fuchsia-100 text-fuchsia-700'
    ];
    const code = char.codePointAt(0) || 0;
    return colors[code % colors.length];
}

// --- 2. จัดการกิจกรรมล่าสุด ---
async function loadRecentActivities() {
    if (isRefreshingRecent) return;
    isRefreshingRecent = true;

    const statusEl = document.getElementById('loadingStatus');
    if(statusEl) statusEl.classList.remove('hidden');

    // โหลด cache ก่อนถ้ามี
    try {
        const cachedRecent = localStorage.getItem('cachedRecent');
        if (cachedRecent) {
            const list = JSON.parse(cachedRecent);
            if (Array.isArray(list) && list.length > 0) {
                renderActivities(list);
            }
        }
    } catch (e) {
        console.warn('cachedRecent parse fail', e);
    }

    try {
        const res = await fetch(API_URL + "?action=getRecent");
        const data = await res.json();
        if (data && data.recent && Array.isArray(data.recent)) {
            renderActivities(data.recent);
            localStorage.setItem('cachedRecent', JSON.stringify(data.recent));
        }
    } catch (e) { console.error("Load activities fail", e); }
    finally {
        if(statusEl) statusEl.classList.add('hidden');
        isRefreshingRecent = false;
    }
}

function renderActivities(list) {
    const listEl = document.getElementById('recentActivityList');
    if (!listEl) return;
    if (!list || list.length === 0) {
        listEl.innerHTML = '<div class="p-6 text-center text-slate-400 italic text-xs">ยังไม่มีประวัติวันนี้</div>';
        return;
    }
    const sorted = Array.isArray(list) ? list.slice().sort((a, b) => {
        if (a.timestamp && b.timestamp) return b.timestamp - a.timestamp;
        return 0;
    }) : list;
    listEl.innerHTML = sorted.map(item => `
        <div class="p-4 flex justify-between items-center bg-white/40 activity-item border-b border-slate-50">
            <div class="flex flex-col">
                <span class="font-black text-slate-700 text-[13px]">${item.name}</span>
                <span class="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">${item.time} | ${item.shift}</span>
                ${item.duration ? `<span class="text-[11px] text-blue-600 font-black italic mt-1 animate-pulse">⏱️ ${item.duration}</span>` : ''}
                <span class="text-[9px] text-slate-400 mt-0.5">${item.note || ''}</span>
            </div>
            <div class="flex flex-col items-end gap-1">
                <span class="px-3 py-1 rounded-full text-[9px] font-black italic uppercase 
                    ${item.type === 'เข้างาน' ? 'bg-emerald-100 text-emerald-600' : 
                      item.type === 'ออกงาน' ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'}">
                    ${item.type}
                </span>
                <span class="text-[9px] text-slate-400 italic">${item.loc || ''}</span>
            </div>
        </div>
    `).join('');
}

// --- 3. ตรวจสอบวินัยเหล็ก & Cooldown ---
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
        if (diff < COOLDOWN_MINUTES) return showModernToast("บันทึกซ้ำ!", `คุณเพิ่งกดไปเมื่อครู่ รออีก ${Math.ceil(COOLDOWN_MINUTES - diff)} นาที`, "⏳", false);
    }
    
    const timeData = getSmartTimeNote(type, selectedShiftName);
    executeSubmit(name, loc, type, selectedShiftName, timeData.note, true);
}

// --- 4. การคำนวณโน้ตเวลา ---
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

// --- 5. ส่งข้อมูล ---
async function executeSubmit(name, loc, type, shift, noteValue, saveCool) {
    isProcessing = true;
    setFormDisabled(true);

    // Optimistic UI: ดันให้ผู้ใช้เห็น event ทันที
    let successMsg = `${type}ลงบันทึกแล้ว <br><small>${noteValue}</small>`;
    showModernToast("กำลังบันทึก...", successMsg, "⏳", false);

    try {
        const res = await fetch(API_URL, { 
            method: "POST", 
            body: JSON.stringify({ name, location: loc, type, shift, note: noteValue }) 
        });
        const data = await res.json();
        if (data.status === "success") {
            if (saveCool) localStorage.setItem(`last_${name}_${type}`, new Date().toISOString());
            if (data.duration) successMsg += `<br><b class="text-blue-600">⏱️ รวมเวลา: ${data.duration}</b>`;
            showModernToast("สำเร็จ!", successMsg, "✅", true);
        } else {
            showModernToast("ข้อผิดพลาด", `ไม่สามารถบันทึกได้: ${data.message || 'unknown'}`, "❌", false);
        }
    } catch (e) {
        showModernToast("ข้อผิดพลาดเครือข่าย", "ไม่สามารถเชื่อมต่อได้ กรุณาลองใหม่", "⚠️", false);
    } finally {
        isProcessing = false;
        setFormDisabled(false);
        loadRecentActivities();
    }
}

// --- 6. UI Helpers (Toast, Modal, Shift Select, Rules) ---
function selectShift(btn, name) {
    document.querySelectorAll('.shift-btn').forEach(b => b.classList.remove('shift-active'));
    btn.classList.add('shift-active'); 
    selectedShiftName = name;
}

// เพิ่มฟังก์ชันกฎระเบียบตรงนี้ครับ
function showRulePopup() {
    const rules = [
        "1. เข้ามาสายนาทีละ 5.-",
        "2. ลืมแจ้งเข้างาน 400.- /ครั้ง",
        "3. ลืมแจ้งออก 250.- /ครั้ง",
        "4. ลางานครึ่งวันหัก 0.5 แรง/ครั้ง",
        "5. ทำงานอื่นในเวลางานหัก 1,000.- /ครั้ง",
        "------------------------------------",
        "*** กฎระบบ WORK SMART ***",
        "------------------------------------",
        "* ถ้ากดผิดต้องรอ 3 นาที ถึงจะกดซ้ำได้",
        "* เวลาแจ้ง เข้า/ออก : บวกลบ 2 ชม. จากเวลาจริง",
        "* กะเช้า 08:00 - 20:00",
        "* กะดึก 20:00 - 08:00"
    ];
    showModernToast("กฎระเบียบ", `<div class='text-left text-xs bg-slate-50 p-4 rounded-2xl'>${rules.map(r=>`<div>${r}</div>`).join('')}</div>`, "📋", false);
}

function showModernToast(title, msg, icon, auto) {
    const t = document.getElementById('appToast');
    const progress = document.getElementById('toastProgress');
    if(!t) return;
    
    document.getElementById('toastIcon').innerText = icon; 
    document.getElementById('toastTitle').innerText = title; 
    document.getElementById('toastMsg').innerHTML = msg;
    t.classList.remove('hidden');
    
    if (auto) {
        document.getElementById('toastBar').classList.remove('hidden');
        document.getElementById('toastCloseBtn').classList.add('hidden');
        setTimeout(() => { if(progress) progress.style.width = '100%'; }, 50);
        setTimeout(() => location.reload(), 2500);
    } else {
        document.getElementById('toastBar').classList.add('hidden');
        document.getElementById('toastCloseBtn').classList.remove('hidden');
    }
}

function closeToast() { document.getElementById('appToast').classList.add('hidden'); }

// --- 7. ส่วนของการลา (Leave Management) ---
function handleLeave(btn, type) {
    const name = document.getElementById('empList').value;
    if (!name) return showModernToast("ข้อมูลไม่ครบ", "เลือกชื่อก่อนค่ะ", "⚠️", false);
    
    currentLeaveType = type; 
    datesSet1 = []; datesSet2 = []; 
    renderDateTags();
    
    document.getElementById('leaveModalTitle').innerText = "รายการ: " + type;
    const area2 = document.getElementById('date2Area');
    const label1 = document.getElementById('dateLabel1');
    
    if (type.includes('สลับ')) {
        area2.classList.remove('hidden');
        label1.innerText = "วันที่ต้องการหยุด";
    } else {
        area2.classList.add('hidden');
        label1.innerText = "วันที่แจ้งลา (เลือกได้หลายวัน)";
    }
    document.getElementById('leaveModal').classList.remove('hidden');
}

function addDateToList(num) {
    const input = document.getElementById(`dateInput${num}`);
    if (!input || !input.value) return;
    const target = (num === 1) ? datesSet1 : datesSet2;
    if (!target.includes(input.value)) { 
        target.push(input.value); 
        target.sort(); renderDateTags(); 
    }
    input.value = "";
}

function removeDate(num, val) {
    if (num === 1) datesSet1 = datesSet1.filter(d => d !== val); 
    else datesSet2 = datesSet2.filter(d => d !== val);
    renderDateTags();
}

function renderDateTags() {
    document.getElementById('dateListDisplay1').innerHTML = datesSet1.map(d => `
        <span class="date-tag">${d} <button onclick="removeDate(1,'${d}')" class="text-rose-500 font-bold ml-1">×</button></span>
    `).join('');
    document.getElementById('dateListDisplay2').innerHTML = datesSet2.map(d => `
        <span class="date-tag bg-blue-100 text-blue-700 border-blue-200">${d} <button onclick="removeDate(2,'${d}')" class="text-rose-500 font-bold ml-1">×</button></span>
    `).join('');
}

async function confirmLeaveSubmit() {
    if (datesSet1.length === 0) return alert("เลือกวันที่ก่อนค่ะ");
    if (!selectedShiftName) return alert("เลือก กะเช้า หรือ กะดึก ก่อนส่งข้อมูลค่ะ");

    const isSwap = currentLeaveType.includes('สลับ');
    if (isSwap && datesSet2.length === 0) return alert("กรุณาเลือกวันที่มาทำงานแทนด้วยค่ะ");

    const note = document.getElementById('leaveNote').value.trim();
    let finalNote = `[${currentLeaveType}] หยุด: ${datesSet1.join(', ')}`;
    if (isSwap) finalNote += ` | แทน: ${datesSet2.join(', ')}`;
    if (note) finalNote += ` (หมายเหตุ: ${note})`;

    document.getElementById('leaveModal').classList.add('hidden');
    executeSubmit(document.getElementById('empList').value, document.getElementById('locList').value || "-", currentLeaveType, selectedShiftName, finalNote, false);
}

function closeLeaveModal() { document.getElementById('leaveModal').classList.add('hidden'); }