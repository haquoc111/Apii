const express = require('express');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// URL API
const BAN_HU_URL = 'https://wtx.tele68.com/v1/tx/lite-sessions?cp=R&cl=R&pf=web&at=62385f65eb49fcb34c72a7d6489ad91d';
const BAN_MD5_URL = 'https://wtxmd52.tele68.com/v1/txmd5/lite-sessions?cp=R&cl=R&pf=web&at=62385f65eb49fcb34c72a7d6489ad91d';

app.use(express.json());

// Helper fetch
async function fetchData(url, endpointName) {
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/json, text/plain, */*',
                'Referer': 'https://tele68.com/'
            },
            timeout: 10000 // tránh treo
        });

        if (!response.ok) {
            throw new Error(HTTP ${response.status});
        }

        const data = await response.json();
        return { success: true, data };

    } catch (error) {
        console.error(Lỗi ${endpointName}:, error.message);
        return { success: false, error: error.message };
    }
}

// API
app.get('/ban-hu', async (req, res) => {
    const result = await fetchData(BAN_HU_URL, 'ban-hu');
    if (result.success) {
        res.json(result.data);
    } else {
        res.status(500).json(result);
    }
});

app.get('/ban-md5', async (req, res) => {
    const result = await fetchData(BAN_MD5_URL, 'ban-md5');
    if (result.success) {
        res.json(result.data);
    } else {
        res.status(500).json(result);
    }
});

// Home
app.get('/', (req, res) => {
    res.send('Server OK: /ban-hu , /ban-md5');
});

// 404
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, () => {
    console.log(Running on port ${PORT});
});