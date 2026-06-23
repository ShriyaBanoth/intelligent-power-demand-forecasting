/* ==========================================
   GridVision AI - Frontend Logic (Vanilla JS)
   ========================================== */

const API_BASE_URL = "http://127.0.0.1:8000";
const ANNUAL_MEAN_LOAD = 71222.89; // kW from EDA statistical summary
let latestWeather = null; // Stores fetched live weather data

document.addEventListener("DOMContentLoaded", () => {
    initSliders();
    initSmartDatetime();
    initPresets();
    checkApiStatus();
    initFormSubmit();
    
    // Fetch external integrated feeds
    loadWeatherFeed();
    loadHolidaysFeed();
    
    // Check API status periodically (every 5 seconds)
    setInterval(checkApiStatus, 5000);
});

/* 1. API Status Checker */
async function checkApiStatus() {
    const statusDot = document.getElementById("api-status");
    const indicatorText = statusDot.querySelector(".indicator-text");
    
    try {
        const response = await fetch(`${API_BASE_URL}/`, { method: "GET" });
        if (response.ok) {
            statusDot.className = "status-indicator online";
            indicatorText.textContent = "Online";
        } else {
            statusDot.className = "status-indicator offline";
            indicatorText.textContent = "Error";
        }
    } catch (error) {
        statusDot.className = "status-indicator offline";
        indicatorText.textContent = "Offline (FastAPI server not running)";
    }
}

/* 2. Interactive Sliders */
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
    });
}

/* 3. Smart Datetime Extractor */
function initSmartDatetime() {
    const picker = document.getElementById("datetime-picker");
    
    picker.addEventListener("change", (e) => {
        if (!e.target.value) return;
        
        const date = new Date(e.target.value);
        
        // Extract hour, day, month
        const hour = date.getHours();
        const day = date.getDate();
        const month = date.getMonth() + 1; // JS is 0-11, Python is 1-12
        
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
    });
}

function updateInputValue(id, val) {
    const input = document.getElementById(id);
    input.value = val;
    triggerHighlight(input);
}

function triggerHighlight(element) {
    element.classList.remove("highlight-flash");
    void element.offsetWidth; // Force reflow
    element.classList.add("highlight-flash");
    
    // Define temporary inline style for flash animation if not in CSS
    element.style.animation = "none";
    void element.offsetHeight;
    element.style.animation = "fadeIn 0.4s ease-out";
}

/* 4. Scenario Presets */
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
            weekday: 3, // Thursday (3)
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
            weekday: 2, // Wednesday (2)
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
            weekday: 3, // Thursday (3)
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
            weekday: 6, // Sunday (6)
            weekend: true
        }
    };
    
    const presetButtons = document.querySelectorAll(".preset-btn");
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
            
            // Show dynamic micro-feedback on preset click
            btn.style.transform = "scale(0.95)";
            setTimeout(() => { btn.style.transform = ""; }, 100);
        });
    });
}

/* 5. Form Submission & API Request */
function initFormSubmit() {
    const form = document.getElementById("prediction-form");
    const placeholder = document.getElementById("result-placeholder");
    const loading = document.getElementById("result-loading");
    const content = document.getElementById("result-content");
    
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        // Show loading spinner, hide other states
        placeholder.classList.add("hidden");
        content.classList.add("hidden");
        loading.classList.remove("hidden");
        
        // Collect form data
        const payload = {
            Temperature: parseFloat(document.getElementById("temperature").value),
            Humidity: parseFloat(document.getElementById("humidity").value),
            WindSpeed: parseFloat(document.getElementById("windspeed").value),
            Hour: parseInt(document.getElementById("hour").value),
            Day: parseInt(document.getElementById("day").value),
            Month: parseInt(document.getElementById("month").value),
            Weekday: parseInt(document.getElementById("weekday").value),
            Weekend: document.getElementById("weekend").checked ? 1 : 0
        };
        
        try {
            const response = await fetch(`${API_BASE_URL}/predict`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Inference server error");
            }
            
            const result = await response.json();
            
            // Render prediction output
            displayResults(result.predicted_load);
            
            // Swap display states
            loading.classList.add("hidden");
            content.classList.remove("hidden");
            
        } catch (error) {
            loading.classList.add("hidden");
            placeholder.classList.remove("hidden");
            
            console.error("Prediction failed:", error);
            alert(
                `❌ Power Forecast Failed!\n\n` +
                `Reason: ${error.message}\n\n` +
                `Please verify that the FastAPI backend server is running on ${API_BASE_URL}. ` +
                `Refer to the README.md setup instructions for help.`
            );
        }
    });
}

/* 6. Result Display & Analytics Calculation */
function displayResults(predictedLoad) {
    const valDisplay = document.getElementById("prediction-value");
    
    // 1. Animate count-up for the main value
    animateValue(valDisplay, 0, predictedLoad, 800);
    
    // 2. Classify demand level & update badge
    const badge = document.getElementById("demand-badge");
    const badgeText = document.getElementById("demand-badge-text");
    
    badge.className = "demand-badge"; // reset classes
    
    let demandCategory = "";
    let riskLevel = "";
    let riskClass = "";
    
    if (predictedLoad < 55000) {
        demandCategory = "low";
        badgeText.textContent = "🔋 Low Demand";
        riskLevel = "Low (Stable)";
        riskClass = "risk-low";
    } else if (predictedLoad >= 55000 && predictedLoad < 75000) {
        demandCategory = "optimal";
        badgeText.textContent = "⚡ Optimal Grid Load";
        riskLevel = "Normal (Balanced)";
        riskClass = "risk-low";
    } else if (predictedLoad >= 75000 && predictedLoad < 95000) {
        demandCategory = "moderate";
        badgeText.textContent = "⚠️ Moderate Load";
        riskLevel = "Elevated (Monitor)";
        riskClass = "risk-med";
    } else {
        demandCategory = "peak";
        badgeText.textContent = "🚨 Peak Demand Alert";
        riskLevel = "Critical Grid Stress";
        riskClass = "risk-high";
    }
    badge.classList.add(demandCategory);
    
    // 3. Compute Analytics compared to Annual Mean
    const percentDiff = ((predictedLoad - ANNUAL_MEAN_LOAD) / ANNUAL_MEAN_LOAD) * 100;
    const diffSign = percentDiff >= 0 ? "+" : "";
    const diffClass = percentDiff >= 0 ? "increase" : "decrease";
    
    const vsMeanDisplay = document.getElementById("analytic-vs-mean");
    vsMeanDisplay.textContent = `${diffSign}${percentDiff.toFixed(2)}%`;
    vsMeanDisplay.className = `analytic-value ${diffClass}`;
    
    // 4. Update Risk Level Display
    const riskDisplay = document.getElementById("analytic-risk");
    riskDisplay.textContent = riskLevel;
    riskDisplay.className = `analytic-value ${riskClass}`;
    
    // 5. Compute Feeder Distribution (realistic mock based on historical typical ratios)
    // Feeder 1 typically handles ~45%, Feeder 2 ~25%, Feeder 3 ~30%
    const f1 = predictedLoad * 0.452;
    const f2 = predictedLoad * 0.248;
    const f3 = predictedLoad * 0.300;
    
    const feedersDisplay = document.getElementById("analytic-feeders");
    feedersDisplay.textContent = `F1: ${formatNum(f1)} | F2: ${formatNum(f2)} | F3: ${formatNum(f3)}`;
}

/* 7. Helper Utilities */
function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        // Easing function outQuad
        const easeProgress = progress * (2 - progress);
        const currentVal = easeProgress * (end - start) + start;
        obj.textContent = formatNum(currentVal);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.textContent = formatNum(end); // ensure exact end value is shown
        }
    };
    window.requestAnimationFrame(step);
}

function formatNum(num) {
    return Math.round(num).toLocaleString();
}

/* 8. Live Weather Feed (Dhanbad) */
async function loadWeatherFeed() {
    const loader = document.getElementById("weather-loader");
    const content = document.getElementById("weather-content");
    
    try {
        const response = await fetch(`${API_BASE_URL}/weather`);
        if (!response.ok) throw new Error("Failed to fetch weather");
        
        const data = await response.json();
        latestWeather = data.current;
        
        // Populate UI elements
        document.getElementById("feed-temp").textContent = `${latestWeather.Temperature.toFixed(1)} °C`;
        document.getElementById("feed-condition").textContent = latestWeather.condition;
        document.getElementById("feed-humidity").textContent = `${latestWeather.Humidity}%`;
        document.getElementById("feed-wind").textContent = `${latestWeather.WindSpeed} m/s`;
        
        // Swap visibility
        loader.classList.add("hidden");
        content.classList.remove("hidden");
        
        // Register button listener
        document.getElementById("apply-weather-btn").addEventListener("click", applyWeatherToSliders);
        
    } catch (error) {
        console.error("Failed to load weather feed:", error);
        loader.innerHTML = `
            <i class="fa-solid fa-cloud-bolt" style="color: var(--danger); font-size: 1.2rem;"></i>
            <span style="margin-top: 0.5rem; display: block;">Feed Offline</span>
        `;
    }
}

function applyWeatherToSliders() {
    if (!latestWeather) return;
    
    // Set Sliders
    const tempSlider = document.getElementById("temperature");
    const humSlider = document.getElementById("humidity");
    const windSlider = document.getElementById("windspeed");
    
    tempSlider.value = latestWeather.Temperature;
    document.getElementById("temp-val").textContent = `${latestWeather.Temperature.toFixed(1)} °C`;
    triggerHighlight(tempSlider.parentElement);
    
    humSlider.value = latestWeather.Humidity;
    document.getElementById("humidity-val").textContent = `${latestWeather.Humidity.toFixed(1)} %`;
    triggerHighlight(humSlider.parentElement);
    
    windSlider.value = latestWeather.WindSpeed;
    document.getElementById("windspeed-val").textContent = `${latestWeather.WindSpeed.toFixed(1)} m/s`;
    triggerHighlight(windSlider.parentElement);
}

/* 9. Grid Holidays Feed */
async function loadHolidaysFeed() {
    const loader = document.getElementById("holidays-loader");
    const listContainer = document.getElementById("holidays-list");
    
    try {
        const response = await fetch(`${API_BASE_URL}/holidays`);
        if (!response.ok) throw new Error("Failed to fetch holidays");
        
        const data = await response.json();
        
        // Clear loader and existing items
        listContainer.innerHTML = "";
        
        data.holidays.forEach(holiday => {
            const item = document.createElement("div");
            item.className = "holiday-item";
            item.setAttribute("data-date", holiday.Date);
            
            const formattedDate = formatHolidayDate(holiday.Date);
            
            item.innerHTML = `
                <span class="holiday-name" title="${holiday.Holiday}">${holiday.Holiday}</span>
                <span class="holiday-date">${formattedDate}</span>
            `;
            
            // Click handler to load this date into the datetime picker
            item.addEventListener("click", () => {
                const picker = document.getElementById("datetime-picker");
                // Set to 12:00 PM (noon) on that holiday date
                picker.value = `${holiday.Date}T12:00`;
                // Manually trigger change event
                picker.dispatchEvent(new Event("change"));
                
                // Temporary visual feedback
                item.style.transform = "scale(0.96)";
                setTimeout(() => { item.style.transform = ""; }, 100);
            });
            
            listContainer.appendChild(item);
        });
        
        // Swap visibility
        loader.classList.add("hidden");
        listContainer.classList.remove("hidden");
        
    } catch (error) {
        console.error("Failed to load holidays feed:", error);
        loader.innerHTML = `
            <i class="fa-solid fa-calendar-xmark" style="color: var(--danger); font-size: 1.2rem;"></i>
            <span style="margin-top: 0.5rem; display: block;">Feed Offline</span>
        `;
    }
}

function formatHolidayDate(dateStr) {
    // Input: YYYY-MM-DD
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const day = parseInt(parts[2]);
    const monthIndex = parseInt(parts[1]) - 1;
    
    return `${day} ${months[monthIndex]}`;
}
