class AuthSystem {
    constructor() {
        this.currentUser = null;
        this.users = JSON.parse(localStorage.getItem('revit_users') || '[]');
        this.init();
    }

    init() {
        this.checkAutoLogin();
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Переключение между логином и регистрацией
        document.getElementById('showRegister').addEventListener('click', (e) => {
            e.preventDefault();
            this.showRegister();
        });

        document.getElementById('showLogin').addEventListener('click', (e) => {
            e.preventDefault();
            this.showLogin();
        });

        // Формы
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        document.getElementById('registerForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleRegister();
        });

        // Выход
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.handleLogout();
        });
    }

    showLogin() {
        document.getElementById('loginPage').classList.remove('hidden');
        document.getElementById('registerPage').classList.add('hidden');
        this.clearErrors();
    }

    showRegister() {
        document.getElementById('registerPage').classList.remove('hidden');
        document.getElementById('loginPage').classList.add('hidden');
        this.clearErrors();
    }

    showApp() {
        document.getElementById('loginPage').classList.add('hidden');
        document.getElementById('registerPage').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
    }

    clearErrors() {
        document.getElementById('loginError').textContent = '';
        document.getElementById('registerError').textContent = '';
    }

    handleLogin() {
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        const user = this.users.find(u => u.email === email && u.password === password);
        
        if (user) {
            this.loginSuccess(user);
        } else {
            this.showError('loginError', 'Неверный email или пароль');
        }
    }

    handleRegister() {
        const name = document.getElementById('registerName').value;
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('registerConfirmPassword').value;
        const department = document.getElementById('registerDepartment').value;

        // Валидация
        if (password !== confirmPassword) {
            this.showError('registerError', 'Пароли не совпадают');
            return;
        }

        if (password.length < 6) {
            this.showError('registerError', 'Пароль должен быть не менее 6 символов');
            return;
        }

        if (this.users.find(u => u.email === email)) {
            this.showError('registerError', 'Пользователь с таким email уже существует');
            return;
        }

        // Создаем пользователя
        const newUser = {
            id: Date.now(),
            name,
            email,
            password, // В реальном приложении пароли нужно хэшировать!
            department,
            role: 'user',
            createdAt: new Date().toISOString()
        };

        this.users.push(newUser);
        this.saveUsers();
        this.loginSuccess(newUser);
    }

    loginSuccess(user) {
        this.currentUser = user;
        localStorage.setItem('currentUser', JSON.stringify(user));
        this.showApp();
        this.updateUserInterface();
        
        // Запускаем дашборд
        if (window.dashboard) {
            window.dashboard.init();
        } else {
            // Если дашборд ещё не создан, отметим, что нужно инициализировать позже
            window.__initDashboardDeferred = true;
        }
    }

    handleLogout() {
        this.currentUser = null;
        localStorage.removeItem('currentUser');
        this.showLogin();
        this.clearForms();
    }

    checkAutoLogin() {
        const savedUser = localStorage.getItem('currentUser');
        if (savedUser) {
            try {
                const user = JSON.parse(savedUser);
                // Проверяем что пользователь все еще существует
                if (this.users.find(u => u.email === user.email)) {
                    this.loginSuccess(user);
                    return;
                }
            } catch (e) {
                console.error('Error parsing saved user:', e);
            }
        }
        // Автовход гостем, чтобы сразу показывать дашборд
        const guest = {
            id: 'guest',
            name: 'Гость',
            email: 'guest@example.com',
            department: 'management',
            role: 'guest',
            createdAt: new Date().toISOString()
        };
        this.loginSuccess(guest);
    }

    updateUserInterface() {
        if (this.currentUser) {
            document.getElementById('currentUser').textContent = 
                `${this.currentUser.name} (${this.getDepartmentName(this.currentUser.department)})`;
        }
    }

    getDepartmentName(department) {
        const departments = {
            'architecture': 'Архитектура',
            'structure': 'Конструкции',
            'mep': 'ИС/ОВ/ВК',
            'management': 'Управление'
        };
        return departments[department] || department;
    }

    showError(elementId, message) {
        document.getElementById(elementId).textContent = message;
    }

    clearForms() {
        document.getElementById('loginForm').reset();
        document.getElementById('registerForm').reset();
        this.clearErrors();
    }

    saveUsers() {
        localStorage.setItem('revit_users', JSON.stringify(this.users));
    }
}

class ChangesDashboard {
    constructor() {
        this.chart = null;
        this.currentData = [];
        this.selectedUser = null; // userNickname or null
        this.uniqueUsers = [];
        this.activeTimeFilter = '24h';
    }

    parseTimestamp(value) {
        if (!value || typeof value !== 'string') return null;
        // Обрезаем наносекунды до миллисекунд: 2025-10-30T18:21:41.928982 -> 2025-10-30T18:21:41.928
        let s = value.replace(/\.(\d{3})\d+/, '.$1');
        // Пытаемся распарсить
        let d = new Date(s);
        if (isNaN(d)) {
            // Фоллбэк: отбросить дробную часть полностью
            const noFrac = value.split('.')[0];
            d = new Date(noFrac);
        }
        return isNaN(d) ? null : d;
    }

    async init() {
        await this.loadData();
        const tf = document.getElementById('timeFilter');
        if (tf && tf.value) this.activeTimeFilter = tf.value;
        this.renderChart();
        this.renderTable();
        this.renderStats();
        this.setupEventListeners();
    }

    async loadData() {
        // Ожидаем данные с сервера в формате:
        // [{ project, timestamp, added, modified, deleted, id, user:{ nickname,... } }, ...]
        const tryFetch = async (url) => {
            const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            return resp.json();
        };

        let data = [];
        try {
            data = await tryFetch('/api/metrics/');
        } catch (e1) {
            console.warn('API alias failed, fallback to /metrics/:', e1);
            try {
                data = await tryFetch('/metrics/');
            } catch (e2) {
                console.error('Both API calls failed:', e2);
                data = [];
            }
        }

        // Нормализуем структуру безопасно
        this.currentData = (Array.isArray(data) ? data : [])
            .map(item => {
                const ts = item && item.timestamp ? this.parseTimestamp(item.timestamp) : null;
                return {
                    project: item && item.project ? item.project : '',
                    timestamp: ts instanceof Date && !isNaN(ts) ? ts : new Date(0),
                    added: Number((item && item.added) ?? 0),
                    modified: Number((item && item.modified) ?? 0),
                    deleted: Number((item && item.deleted) ?? 0),
                    id: item && item.id ? item.id : undefined,
                    userNickname: item && item.user && item.user.nickname ? item.user.nickname : ''
                };
            })
            .filter(row => row.timestamp instanceof Date && !isNaN(row.timestamp))
            .sort((a, b) => a.timestamp - b.timestamp); // по возрастанию времени слева направо

        // Собираем список уникальных пользователей и обновляем селект
        const usersSet = new Set(this.currentData.map(it => it.userNickname).filter(Boolean));
        this.uniqueUsers = Array.from(usersSet);
        this.populateUserFilter();

        // Если пользователь ещё не выбран, по умолчанию показываем первого в списке
        if (!this.selectedUser) {
            this.selectedUser = this.uniqueUsers[0] || null;
            const userFilter = document.getElementById('userFilter');
            if (userFilter && this.selectedUser) {
                userFilter.value = this.selectedUser;
            }
        }
    }

    populateUserFilter() {
        const sel = document.getElementById('userFilter');
        if (!sel) return;
        const current = this.selectedUser;
        sel.innerHTML = this.uniqueUsers.length
            ? [
                '<option value="__auto__">Выберите пользователя…</option>',
                ...this.uniqueUsers.map(u => `<option value="${u}">${u}</option>`)
              ].join('')
            : '<option value="__auto__">Нет пользователей</option>';
        if (current && this.uniqueUsers.includes(current)) {
            sel.value = current;
        }
    }

    getFilteredData() {
        if (!this.selectedUser) return [];
        const now = Date.now();
        const windowMs = this.getWindowMs(this.activeTimeFilter);
        const threshold = new Date(now - windowMs);
        return this.currentData.filter(row => {
            const byUser = row.userNickname === this.selectedUser;
            const byTime = row.timestamp >= threshold;
            return byUser && byTime;
        });
    }

    getWindowMs(key) {
        switch (key) {
            case '1h': return 60 * 60 * 1000;
            case '24h': return 24 * 60 * 60 * 1000;
            case '7d': return 7 * 24 * 60 * 60 * 1000;
            default: return 24 * 60 * 60 * 1000;
        }
    }

    renderChart() {
        const ctx = document.getElementById('changesChart').getContext('2d');
        // Фильтруем по выбранному пользователю
        const rows = this.getFilteredData();
        const labels = rows.map(it => it.timestamp.toLocaleString('ru-RU'));
        const addedData = rows.map(it => it.added);
        const modifiedData = rows.map(it => it.modified);
        const deletedData = rows.map(it => it.deleted);
        
        if (this.chart) {
            this.chart.destroy();
        }

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Добавлено',
                        data: addedData,
                        borderColor: '#27ae60',
                        backgroundColor: 'rgba(39, 174, 96, 0.1)',
                        tension: 0.4
                    },
                    {
                        label: 'Изменено',
                        data: modifiedData,
                        borderColor: '#f39c12',
                        backgroundColor: 'rgba(243, 156, 18, 0.1)',
                        tension: 0.4
                    },
                    {
                        label: 'Удалено',
                        data: deletedData,
                        borderColor: '#e74c3c',
                        backgroundColor: 'rgba(231, 76, 60, 0.1)',
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: this.selectedUser ? `Изменения элементов по времени — ${this.selectedUser}` : 'Изменения элементов по времени'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Количество изменений'
                        }
                    },
                    x: {
                        title: { display: true, text: 'Время' },
                        ticks: { maxRotation: 45, minRotation: 0, autoSkip: true, maxTicksLimit: 12 }
                    }
                }
            }
        });
    }

    groupDataByHour() {
        // Группируем по фактически имеющимся часам в данных
        const bucketMap = new Map(); // key: YYYY-MM-DD HH, value: {added, modified, deleted}
        const pad2 = (n) => String(n).padStart(2, '0');
        for (const item of this.currentData) {
            const d = item.timestamp;
            if (!(d instanceof Date) || isNaN(d)) continue;
            const key = `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:00`;
            if (!bucketMap.has(key)) bucketMap.set(key, { added: 0, modified: 0, deleted: 0 });
            const agg = bucketMap.get(key);
            agg.added += Number(item.added) || 0;
            agg.modified += Number(item.modified) || 0;
            agg.deleted += Number(item.deleted) || 0;
        }

        const entries = Array.from(bucketMap.entries())
            .map(([label, vals]) => ({ label, ...vals }))
            .sort((a, b) => a.label.localeCompare(b.label));

        return {
            labels: entries.map(e => e.label),
            added: entries.map(e => e.added),
            modified: entries.map(e => e.modified),
            deleted: entries.map(e => e.deleted),
        };
    }

    renderTable() {
        const tbody = document.getElementById('changesTableBody');
        const rows = this.getFilteredData();

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#7f8c8d;">Нет данных для отображения</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(item => `
            <tr>
                <td>${item.timestamp.toLocaleString('ru-RU')}</td>
                <td>${item.project || ''}</td>
                <td>${item.added}</td>
                <td>${item.modified}</td>
                <td>${item.deleted}</td>
                <td>${item.userNickname || ''}</td>
            </tr>
        `).join('');
    }

    renderStats() {
        const data = this.getFilteredData();
        const sum = (arr, key) => arr.reduce((acc, it) => acc + (Number(it[key]) || 0), 0);
        const addedCount = sum(data, 'added');
        const modifiedCount = sum(data, 'modified');
        const deletedCount = sum(data, 'deleted');
        document.getElementById('addedCount').textContent = addedCount;
        document.getElementById('modifiedCount').textContent = modifiedCount;
        document.getElementById('deletedCount').textContent = deletedCount;
    }

    getChangeTypeText(changeType) {
        const types = {
            'added': 'Добавлено',
            'modified': 'Изменено',
            'deleted': 'Удалено'
        };
        return types[changeType] || changeType;
    }

    setupEventListeners() {
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.refreshData();
        });

        document.getElementById('timeFilter').addEventListener('change', (e) => {
            this.applyTimeFilter(e.target.value);
        });

        const userFilter = document.getElementById('userFilter');
        if (userFilter) {
            userFilter.addEventListener('change', (e) => {
                const value = e.target.value;
                if (value === '__auto__') {
                    // Автовыбор: первый доступный пользователь
                    this.selectedUser = this.uniqueUsers[0] || null;
                    if (this.selectedUser) e.target.value = this.selectedUser;
                } else {
                    this.selectedUser = value || null;
                }
                this.renderChart();
                this.renderTable();
                this.renderStats();
            });
        }
    }

    async refreshData() {
        const refreshBtn = document.getElementById('refreshBtn');
        refreshBtn.textContent = 'Обновление...';
        refreshBtn.disabled = true;
        
        await this.loadData();
        this.renderChart();
        this.renderTable();
        this.renderStats();
        
        refreshBtn.textContent = 'Обновить';
        refreshBtn.disabled = false;
    }

    applyTimeFilter(filter) {
        this.activeTimeFilter = filter || '24h';
        this.renderChart();
        this.renderTable();
        this.renderStats();
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    // Создаем дашборд раньше, чтобы он был доступен при автологине
    window.dashboard = new ChangesDashboard();

    // Создаем систему аутентификации
    window.authSystem = new AuthSystem();

    // Если был автологин до создания дашборда — инициализируем сейчас
    const savedUser = localStorage.getItem('currentUser');
    if (window.__initDashboardDeferred || savedUser) {
        try { window.dashboard.init(); } catch (e) { console.error('Dashboard init failed:', e); }
        window.__initDashboardDeferred = false;
    }
});