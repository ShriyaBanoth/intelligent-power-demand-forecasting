/* ==========================================================================
   GridVision AI - Intelligent Grid Operator Dashboard Controller (Vanilla JS)
   ========================================================================== */

const API_BASE_URL = "http://127.0.0.1:8000";
const ANNUAL_MEAN_LOAD = 71222.89; // kW from EDA statistical summary

// Typical diurnal power grid load scaling profile (relative multipliers)
const DIURNAL_LOAD_MULTIPLIERS = {
    0: 0.78, 1: 0.75, 2: 0.73, 3: 0.72, 4: 0.74, 5: 0.78,
    6: 0.84, 7: 0.89, 8: 0.93, 9: 0.96, 10: 0.98, 11: 1.00,
    12: 1.02, 13: 1.01, 14: 1.04, 15: 1.06, 16: 1.05, 17: 1.03,
    18: 1.08, 19: 1.15, 20: 1.18, 21: 1.14, 22: 1.05, 23: 0.90
};

// Global Chart & Feed State
let forecastChart = null;
let latestWeather = null;

document.addEventListener("DOMContentLoaded", async () => {
    initSliders();
    initSmartDatetime();
    initPresets();
    initFormSubmit();
    initWeatherSync();
    
    // Check API status
    const isOnline = await checkApiStatus();
    
    // Set up periodic status checking (every 5 seconds)
    setInterval(checkApiStatus, 5000);
    
    if (isOnline) {
        // Load initial external feeds
        await loadWeatherFeed();
        await loadHolidaysFeed();
        
        // Populate datetime picker with current local time (rounded to nearest hour)
        setDefaultDatetime();
        
        // Auto-run initial forecast profile to populate the dashboard on load
        generateForecastProfile();
    }
});

/* 1. API Status Heartbeat Checker */
async function checkApiStatus() {
    const statusDot = document.getElementById("api-status");
    const indicatorText = statusDot.querySelector(".indicator-text");
    
    try {
        const response = await fetch(`${API_BASE_URL}/`, { method: "GET" });
        if (response.ok) {
            statusDot.className = "status-indicator online";
            indicatorText.textContent = "Online";
            return true;
        } else {
            statusDot.className = "status-indicator offline";
            indicatorText.textContent = "Service Error";
            return false;
        }
    } catch (error) {
        statusDot.className = "status-indicator offline";
        indicatorText.textContent = "Offline (Backend Server Stopped)";
        return false;
    }
}

/* 2. Default Datetime Setup */
function setDefaultDatetime() {
    const picker = document.getElementById("datetime-picker");
    const now = new Date();
    
    // Format to YYYY-MM-DDTHH:MM
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    
    picker.value = `${year}-${month}-${day}T${hour}:00`;
    
    // Trigger extraction
    extractTemporalFeatures(picker.value);
}

/* 3. Interactive Sliders */
function initSliders() {
    const sliders = [
        { id: "temperature", valId: "temp-val", unit: " °C" },
        { id: "humidity", valId: "humidity-val", unit: " %" },
        { id: "windspeed", valId: "windspeed-val", unit: " m/s" }
    ];
    
    sliders.forEach(sliderInfo => {
        const slider = document.getElementById(sliderInfo.id);
        const valDisplay = document.getElementById(sliderInfo.valId);
        
        slider.addEventListener("input", (e) => {
            valDisplay.textContent = parseFloat(e.target.value).toFixed(1) + sliderInfo.unit;
        });
        
        slider.addEventListener("change", () => {
            // Re-run forecast when slider is released (instant feedback)
            generateForecastProfile();
        });
    });
}

/* 4. Smart Datetime Extractor */
function initSmartDatetime() {
    const picker = document.getElementById("datetime-picker");
    
    picker.addEventListener("change", (e) => {
        if (!e.target.value) return;
        extractTemporalFeatures(e.target.value);
        // Auto-run forecast on datetime change
        generateForecastProfile();
    });
}

function extractTemporalFeatures(datetimeVal) {
    const date = new Date(datetimeVal);
    
    // Extract hour, day, month
    const hour = date.getHours();
    const day = date.getDate();
    const month = date.getMonth() + 1; // JS is 0-11, Pandas is 1-12
    
    // Map JS Weekday (0 = Sun, 1 = Mon, ..., 6 = Sat) 
    // to Pandas Weekday (0 = Mon, 1 = Tue, ..., 5 = Sat, 6 = Sun)
    const jsDay = date.getDay();
    const pandasWeekday = (jsDay === 0) ? 6 : jsDay - 1;
    
    // Determine Weekend (Sat = 5, Sun = 6)
    const isWeekend = (pandasWeekday >= 5) ? 1 : 0;
    
    // Populate inputs
    updateInputValue("hour", hour);
    updateInputValue("day", day);
    updateInputValue("month", month);
    updateInputValue("weekday", pandasWeekday);
    
    // Populate Weekend Toggle
    const weekendCheckbox = document.getElementById("weekend");
    weekendCheckbox.checked = (isWeekend === 1);
    triggerHighlight(weekendCheckbox.parentElement);
}

function updateInputValue(id, val) {
    const input = document.getElementById(id);
    if (input) {
        input.value = val;
        triggerHighlight(input);
    }
}

function triggerHighlight(element) {
    if (!element) return;
    element.classList.remove("highlight-flash");
    void element.offsetWidth; // Force reflow
    element.classList.add("highlight-flash");
}

/* 5. Scenario Presets */
function initPresets() {
    const presets = {
        "summer-peak": {
            datetime: "2017-06-15T15:00",
            temp: 42.5,
            humidity: 45.0,
            wind: 1.5,
            hour: 15,
            day: 15,
            month: 6,
            weekday: 3, // Thursday
            weekend: false
        },
        "winter-night": {
            datetime: "2017-12-20T21:30",
            temp: 7.2,
            humidity: 82.0,
            wind: 0.8,
            hour: 21,
            day: 20,
            month: 12,
            weekday: 2, // Wednesday
            weekend: false
        },
        "monsoon-weekday": {
            datetime: "2017-08-10T08:30",
            temp: 24.5,
            humidity: 92.0,
            wind: 4.2,
            hour: 8,
            day: 10,
            month: 8,
            weekday: 3, // Thursday
            weekend: false
        },
        "spring-weekend": {
            datetime: "2017-03-26T10:00",
            temp: 28.0,
            humidity: 52.0,
            wind: 2.3,
            hour: 10,
            day: 26,
            month: 3,
            weekday: 6, // Sunday
            weekend: true
        }
    };
    
    const presetButtons = document.querySelectorAll(".preset-pill");
    presetButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const key = btn.getAttribute("data-preset");
            const data = presets[key];
            if (!data) return;
            
            // Set Datetime Picker
            document.getElementById("datetime-picker").value = data.datetime;
            
            // Set Weather Sliders
            document.getElementById("temperature").value = data.temp;
            document.getElementById("temp-val").textContent = data.temp.toFixed(1) + " °C";
            
            document.getElementById("humidity").value = data.humidity;
            document.getElementById("humidity-val").textContent = data.humidity.toFixed(1) + " %";
            
            document.getElementById("windspeed").value = data.wind;
            document.getElementById("windspeed-val").textContent = data.wind.toFixed(1) + " m/s";
            
            // Set Temporal Inputs
            updateInputValue("hour", data.hour);
            updateInputValue("day", data.day);
            updateInputValue("month", data.month);
            updateInputValue("weekday", data.weekday);
            
            const weekendCheckbox = document.getElementById("weekend");
            weekendCheckbox.checked = data.weekend;
            triggerHighlight(weekendCheckbox.parentElement);
            
            // Re-run forecast profile immediately on preset click
            generateForecastProfile();
            
            // Button feedback
            btn.style.transform = "scale(0.95)";
            setTimeout(() => { btn.style.transform = ""; }, 100);
        });
    });
}

/* 6. Form Submission Handler */
function initFormSubmit() {
    const form = document.getElementById("prediction-form");
    form.addEventListener("submit", (e) => {
        e.preventDefault();
        generateForecastProfile();
    });
}

/* 7. Weather Sync Button Initialization */
function initWeatherSync() {
    const syncBtn = document.getElementById("sync-weather-btn");
    syncBtn.addEventListener("click", async () => {
        const icon = syncBtn.querySelector("i");
        icon.classList.add("fa-spin");
        
        await loadWeatherFeed();
        
        setTimeout(() => {
            icon.classList.remove("fa-spin");
            // Auto-run forecast once weather is synchronized
            generateForecastProfile();
        }, 600);
    });
}

/* 8. Live Weather & Holidays Feeds Loader */
async function loadWeatherFeed() {
    try {
        const response = await fetch(`${API_BASE_URL}/weather`);
        if (!response.ok) throw new Error("Weather request failed");
        
        const data = await response.json();
        latestWeather = data.current;
        
        // Update TOP Weather Card
        document.getElementById("top-temp").textContent = latestWeather.Temperature.toFixed(1);
        document.getElementById("top-condition").textContent = latestWeather.condition;
        document.getElementById("top-humidity").textContent = `${latestWeather.Humidity.toFixed(0)}%`;
        document.getElementById("top-wind").textContent = `${latestWeather.WindSpeed.toFixed(1)} m/s`;
        
        // Sync weather parameters to form sliders
        document.getElementById("temperature").value = latestWeather.Temperature;
        document.getElementById("temp-val").textContent = `${latestWeather.Temperature.toFixed(1)} °C`;
        
        document.getElementById("humidity").value = latestWeather.Humidity;
        document.getElementById("humidity-val").textContent = `${latestWeather.Humidity.toFixed(1)} %`;
        
        document.getElementById("windspeed").value = latestWeather.WindSpeed;
        document.getElementById("windspeed-val").textContent = `${latestWeather.WindSpeed.toFixed(1)} m/s`;
        
    } catch (error) {
        console.error("Weather feed loading failed:", error);
        document.getElementById("top-temp").textContent = "N/A";
        document.getElementById("top-condition").textContent = "Station offline";
    }
}

async function loadHolidaysFeed() {
    const loader = document.getElementById("holidays-loader");
    const listContainer = document.getElementById("holidays-list");
    
    try {
        const response = await fetch(`${API_BASE_URL}/holidays`);
        if (!response.ok) throw new Error("Holidays request failed");
        
        const data = await response.json();
        listContainer.innerHTML = "";
        
        data.holidays.forEach(h => {
            const item = document.createElement("div");
            item.className = "holiday-item";
            item.setAttribute("data-date", h.Date);
            
            const parts = h.Date.split("-");
            const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const dayText = `${parseInt(parts[2])} ${months[parseInt(parts[1]) - 1]}`;
            
            item.innerHTML = `
                <span class="holiday-name" title="${h.Holiday}">${h.Holiday}</span>
                <span class="holiday-date">${dayText}</span>
            `;
            
            item.addEventListener("click", () => {
                const picker = document.getElementById("datetime-picker");
                picker.value = `${h.Date}T12:00`; // noon
                extractTemporalFeatures(picker.value);
                generateForecastProfile();
                
                // Visual bounce
                item.style.transform = "scale(0.96)";
                setTimeout(() => { item.style.transform = ""; }, 100);
            });
            
            listContainer.appendChild(item);
        });
        
        loader.classList.add("hidden");
        listContainer.classList.remove("hidden");
        
    } catch (error) {
        console.error("Holidays feed loading failed:", error);
        loader.innerHTML = `<span class="text-danger"><i class="fa-solid fa-triangle-exclamation"></i> Feed offline</span>`;
    }
}

/* 9. Core Forecast Profile Compiler (Diurnal Curve + Temperature Wave) */
async function generateForecastProfile() {
    const btn = document.getElementById("predict-btn");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Running Pipeline...`;
    
    // Collect parameters
    const selectedHour = parseInt(document.getElementById("hour").value);
    const selectedDay = parseInt(document.getElementById("day").value);
    const selectedMonth = parseInt(document.getElementById("month").value);
    const selectedWeekday = parseInt(document.getElementById("weekday").value);
    const selectedWeekend = document.getElementById("weekend").checked ? 1 : 0;
    
    const selectedTemp = parseFloat(document.getElementById("temperature").value);
    const selectedHumidity = parseFloat(document.getElementById("humidity").value);
    const selectedWindSpeed = parseFloat(document.getElementById("windspeed").value);
    
    const payload = {
        Temperature: selectedTemp,
        Humidity: selectedHumidity,
        WindSpeed: selectedWindSpeed,
        Hour: selectedHour,
        Day: selectedDay,
        Month: selectedMonth,
        Weekday: selectedWeekday,
        Weekend: selectedWeekend
    };
    
    try {
        // 1. Call POST /predict for the active parameters
        const response = await fetch(`${API_BASE_URL}/predict`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error("API forecast request failed");
        
        const data = await response.json();
        const predictedLoad = data.predicted_load;
        
        // 2. Generate 24-hour load curve and temperature wave around this prediction
        const hourlyProfile = [];
        const baseDiurnalScale = DIURNAL_LOAD_MULTIPLIERS[selectedHour] || 1.0;
        
        for (let h = 0; h < 24; h++) {
            // A. Diurnal Demand calculation: Load(h) = PredictedLoad * (DiurnalMultiplier(h) / DiurnalMultiplier(selectedHour))
            const hourMultiplier = DIURNAL_LOAD_MULTIPLIERS[h] || 1.0;
            const hourLoad = predictedLoad * (hourMultiplier / baseDiurnalScale);
            
            // B. Diurnal Temperature wave calculation (Sine wave peaking at 15:00, coldest at 03:00)
            const tempWaveOffset = Math.sin((2 * Math.PI * (h - 9)) / 24) - Math.sin((2 * Math.PI * (selectedHour - 9)) / 24);
            const hourTemp = selectedTemp + (4.0 * tempWaveOffset);
            
            // C. Risk classification matching exact thresholds: Low < 50k, Med 50k-70k, High > 70k
            let riskText = "";
            let riskClass = "";
            if (hourLoad < 50000) {
                riskText = "Low";
                riskClass = "low";
            } else if (hourLoad >= 50000 && hourLoad <= 70000) {
                riskText = "Medium";
                riskClass = "optimal"; // maps to yellow/amber styling class
            } else {
                riskText = "High";
                riskClass = "peak"; // maps to red risk class
            }
            
            hourlyProfile.push({
                hour: h,
                temperature: hourTemp,
                predicted_load: hourLoad,
                risk: riskText,
                riskClass: riskClass
            });
        }
        
        // 3. Update top-row KPI Cards
        updateTopForecastCard(predictedLoad, payload);
        
        // 4. Update AI Grid Insights
        generateAIInsights(hourlyProfile, payload);
        
        // 5. Update Chart.js curve
        const chartOverlay = document.getElementById("chart-placeholder");
        if (chartOverlay) chartOverlay.classList.add("hidden");
        updateChart(hourlyProfile);
        
        // 6. Populate Hourly Forecast Table
        updateTable(hourlyProfile);
        
    } catch (error) {
        console.error("Forecast execution failed:", error);
        alert(`❌ Forecast execution failed.\nReason: ${error.message}\nEnsure the FastAPI backend is running.`);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-magnifying-glass-chart"></i> Generate Demand Forecast`;
    }
}

/* 10. KPI Cards & AI Insights Renderer */
function updateTopForecastCard(predictedLoad, payload) {
    // A. Predicted Demand
    const topPred = document.getElementById("top-prediction");
    animateValue(topPred, 0, predictedLoad, 650);
    
    // B. Target period
    const hourPad = String(payload.Hour).padStart(2, '0');
    document.getElementById("top-target-time").textContent = `${hourPad}:00`;
    
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    document.getElementById("top-target-date").textContent = `${payload.Day} ${months[payload.Month - 1]} (${weekdays[payload.Weekday]})`;
    
    // C. Feeders load breakdowns
    const f1 = predictedLoad * 0.452;
    const f2 = predictedLoad * 0.248;
    const f3 = predictedLoad * 0.300;
    document.getElementById("top-feeders").textContent = `Feeder loads: F1: ${formatNum(f1)} | F2: ${formatNum(f2)} | F3: ${formatNum(f3)} kW`;
    
    // D. Grid Risk Badge matching exact thresholds: Low < 50k, Med 50k-70k, High > 70k
    const badge = document.getElementById("risk-badge");
    badge.className = "risk-badge-top";
    
    if (predictedLoad < 50000) {
        badge.classList.add("risk-low-badge");
        badge.textContent = "Low Risk";
    } else if (predictedLoad >= 50000 && predictedLoad <= 70000) {
        badge.classList.add("risk-med-badge");
        badge.textContent = "Medium Risk";
    } else {
        badge.classList.add("risk-high-badge");
        badge.textContent = "High Risk";
    }
}

function generateAIInsights(hourlyProfile, payload) {
    // 1. Peak Demand Hour detection
    let peakVal = 0;
    let peakHour = 12;
    hourlyProfile.forEach(p => {
        if (p.predicted_load > peakVal) {
            peakVal = p.predicted_load;
            peakHour = p.hour;
        }
    });
    const peakHourPad = String(peakHour).padStart(2, '0');
    document.getElementById("insight-peak").innerHTML = `<strong>${peakHourPad}:00</strong> with <strong>${formatNum(peakVal)} kW</strong>.`;
    
    // 2. Load curve trend estimation
    const averageLoad = hourlyProfile.reduce((acc, p) => acc + p.predicted_load, 0) / 24;
    const trendSpan = document.getElementById("insight-trend");
    
    if (peakVal > 72000) {
        trendSpan.textContent = "Grid is experiencing heavy peak demands. Suggest load-shedding prevention or backup dispatch.";
    } else if (averageLoad < 50000) {
        trendSpan.textContent = "Sustained low load profile across the grid. Safe operating envelope with maximum headroom.";
    } else {
        trendSpan.textContent = "Stable diurnal curves within normal load thresholds. Nominal baseline operating values.";
    }
    
    // 3. Climate Grid Stress analysis
    const weatherSpan = document.getElementById("insight-weather");
    const temp = payload.Temperature;
    const humidity = payload.Humidity;
    
    if (temp >= 38.0) {
        weatherSpan.innerHTML = `Extreme heat wave (<strong>${temp.toFixed(1)}°C</strong>) triggering major cooling loads (HVAC surge).`;
    } else if (temp <= 12.0) {
        weatherSpan.innerHTML = `Cold wave conditions (<strong>${temp.toFixed(1)}°C</strong>) pushing morning heating demand spikes.`;
    } else if (humidity >= 80.0) {
        weatherSpan.innerHTML = `High relative humidity (<strong>${humidity.toFixed(0)}%</strong>) raising heat indexes. Expect sustained baseline load.`;
    } else {
        weatherSpan.textContent = "Neutral atmospheric climate conditions. Grid weather-stress index is normal.";
    }
}

/* 11. Chart.js & Table Redraw Managers */
function updateChart(hourlyProfile) {
    const ctx = document.getElementById('forecastChart').getContext('2d');
    
    const labels = hourlyProfile.map(p => `${String(p.hour).padStart(2, '0')}:00`);
    const dataValues = hourlyProfile.map(p => p.predicted_load);
    
    // Create gradient area fill
    const gradient = ctx.createLinearGradient(0, 0, 0, 270);
    gradient.addColorStop(0, 'rgba(0, 242, 254, 0.35)');
    gradient.addColorStop(0.5, 'rgba(0, 242, 254, 0.1)');
    gradient.addColorStop(1, 'rgba(0, 242, 254, 0.0)');
    
    if (forecastChart) {
        forecastChart.data.labels = labels;
        forecastChart.data.datasets[0].data = dataValues;
        forecastChart.update();
    } else {
        forecastChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Predicted Grid Demand',
                    data: dataValues,
                    borderColor: '#00f2fe',
                    borderWidth: 3,
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#080b11',
                    pointBorderColor: '#00f2fe',
                    pointBorderWidth: 2.5,
                    pointRadius: 4.5,
                    pointHoverRadius: 7,
                    pointHoverBackgroundColor: '#00f2fe',
                    pointHoverBorderColor: '#ffffff',
                    pointHoverBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#0d1320',
                        titleColor: '#f8fafc',
                        titleFont: { family: 'Outfit', size: 12, weight: 'bold' },
                        bodyColor: '#00f2fe',
                        bodyFont: { family: 'Inter', size: 13, weight: 'bold' },
                        borderColor: 'rgba(255, 255, 255, 0.08)',
                        borderWidth: 1,
                        padding: 10,
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return `Demand: ${context.parsed.y.toLocaleString()} kW`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.03)' },
                        ticks: { color: '#94a3b8', font: { family: 'Inter', size: 10 } }
                    },
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.03)' },
                        ticks: {
                            color: '#94a3b8',
                            font: { family: 'Inter', size: 10 },
                            callback: function(value) {
                                return `${Math.round(value / 1000)}k kW`;
                            }
                        }
                    }
                }
            }
        });
    }
}

function updateTable(hourlyProfile) {
    const tbody = document.getElementById("hourly-table-body");
    tbody.innerHTML = "";
    
    hourlyProfile.forEach(p => {
        const tr = document.createElement("tr");
        
        let statusBadgeText = "";
        if (p.risk === "Low") statusBadgeText = "Low";
        else if (p.risk === "Medium") statusBadgeText = "Medium";
        else statusBadgeText = "High";
        
        tr.innerHTML = `
            <td><strong>${String(p.hour).padStart(2, '0')}:00</strong></td>
            <td>${p.temperature.toFixed(1)} °C</td>
            <td><strong>${formatNum(p.predicted_load)} kW</strong></td>
            <td><span class="table-badge ${p.riskClass}">${statusBadgeText}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

/* 12. Animators & Helpers */
function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeProgress = progress * (2 - progress); // outQuad
        const currentVal = easeProgress * (end - start) + start;
        obj.textContent = formatNum(currentVal);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.textContent = formatNum(end);
        }
    };
    window.requestAnimationFrame(step);
}

function formatNum(num) {
    return Math.round(num).toLocaleString();
}
