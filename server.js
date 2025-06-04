const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('🎉 Backend GPX7 está funcionando! 🎉');
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    console.log('Tentativa de login recebida no backend:');
    console.log('Email:', email);
    console.log('Senha:', password); // Em um app real, nunca logue senhas em produção!

    if (!email || !password) {
        return res.status(400).json({ message: 'Email e senha são obrigatórios!' });
    }

    const mockUserEmail = 'usuario@gpx7.com';
    const mockUserPassword = 'senha123';

    if (email === mockUserEmail && password === mockUserPassword) {
        console.log('Login bem-sucedido para:', email);
        res.status(200).json({
            message: 'Login bem-sucedido!',
            user: {
                email: mockUserEmail,
                name: 'Usuário GPX7 Teste'
            }
        });
    } else {
        console.log('Falha no login para:', email);
        res.status(401).json({ message: 'Email ou senha inválidos.' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor backend GPX7 rodando na porta ${PORT}`);
    if (process.env.NODE_ENV !== 'production') { // Só mostra o localhost se não estiver em produção (Render)
        console.log(`Acesse em http://localhost:${PORT}`);
    }
});