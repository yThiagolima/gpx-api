const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Configuração do MongoDB ---
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
    console.error("ERRO FATAL: MONGODB_URI não está definida nas variáveis de ambiente.");
    process.exit(1);
}

const client = new MongoClient(mongoUri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});
let db;

async function connectDB() {
    try {
        await client.connect();
        db = client.db("GPX7_DB"); 
        console.log("Conectado com sucesso ao MongoDB! 🥭");
    } catch (err) {
        console.error("Falha ao conectar com o MongoDB ❌", err);
        process.exit(1);
    }
}

// --- Middlewares ---
app.use(cors());
app.use(express.json());

// --- Helper para criar query de data para Relatórios ---
function getDateQuery(mes, ano) {
    const query = {};
    if (ano && ano !== 'todos') {
        const year = parseInt(ano);
        let startDate, endDate;
        if (mes && mes !== 'todos') {
            const month = parseInt(mes) - 1; 
            startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0)); 
            endDate = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999)); 
        } else {
            startDate = new Date(Date.UTC(year, 0, 1, 0, 0, 0)); 
            endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)); 
        }
        query.dateMatch = { $gte: startDate, $lte: endDate }; 
    }
    return query;
}


// --- Rotas ---
app.get('/', (req, res) => {
    res.send('🎉 Backend GPX7 v2 está funcionando e conectado ao MongoDB! 🎉');
});

// --- Rota de REGISTRO ---
app.post('/register', async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
    if (username.length < 3) return res.status(400).json({ message: 'Nome de usuário deve ter pelo menos 3 caracteres.' });
    if (password.length < 6) return res.status(400).json({ message: 'A senha deve ter pelo menos 6 caracteres.' });
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) return res.status(400).json({ message: 'Nome de usuário inválido.' });
    if (!/\S+@\S+\.\S+/.test(email)) return res.status(400).json({ message: 'Email inválido.' });
    try {
        const usersCollection = db.collection('users');
        const usernameInputLower = username.toLowerCase();
        const emailInputLower = email.toLowerCase();
        const existingUser = await usersCollection.findOne({ $or: [{ username: usernameInputLower }, { email: emailInputLower }] });
        if (existingUser) {
            if (existingUser.username === usernameInputLower) return res.status(409).json({ message: 'Nome de usuário já em uso.' });
            if (existingUser.email === emailInputLower) return res.status(409).json({ message: 'Email já cadastrado.' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = { username, email: emailInputLower, password: hashedPassword, createdAt: new Date() };
        const result = await usersCollection.insertOne(newUser);
        res.status(201).json({ message: 'Usuário registrado!', user: { id: result.insertedId, username, email } });
    } catch (error) { res.status(500).json({ message: 'Erro ao registrar.' }); }
});

// --- Rota de LOGIN ---
app.post('/login', async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { loginIdentifier, password } = req.body;
    if (!loginIdentifier || !password) return res.status(400).json({ message: 'Campos obrigatórios.' });
    try {
        const usersCollection = db.collection('users');
        const loginIdentifierLower = loginIdentifier.toLowerCase();
        const user = await usersCollection.findOne({ $or: [{ username: { $regex: new RegExp(`^${loginIdentifierLower}$`, 'i') } }, { email: loginIdentifierLower }] });
        if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ message: 'Credenciais inválidas.' });
        res.status(200).json({ message: 'Login bem-sucedido!', user: { id: user._id, username: user.username, email: user.email } });
    } catch (error) { res.status(500).json({ message: 'Erro no login.' }); }
});

const simpleAuthCheck = (req, res, next) => { next(); };

// --- ROTAS DA API PARA A DASHBOARD ---
app.get('/api/dashboard/stats', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    try {
        const totalVeiculos = await db.collection('veiculos').countDocuments();
        const inicioHoje = new Date(new Date().setUTCHours(0, 0, 0, 0)); 
        const veiculosParaAlerta = await db.collection('veiculos').find({
            $or: [
                { 'manutencaoInfo.proxTrocaOleoData': { $exists: true, $ne: null } },
                { 'manutencaoInfo.proxTrocaOleoKm': { $exists: true, $ne: null } },
                { 'manutencaoInfo.dataProxChecklist': { $exists: true, $ne: null } }
            ]
        }).toArray();
        let alertasAtivosCount = 0, manutencoesAgendadasCount = 0;
        veiculosParaAlerta.forEach(v => {
            let alertaVencido = false, agendamentoFuturo = false;
            if (v.manutencaoInfo) {
                if (v.manutencaoInfo.proxTrocaOleoData) { const d = new Date(v.manutencaoInfo.proxTrocaOleoData); if (d < inicioHoje) alertaVencido = true; else agendamentoFuturo = true; }
                if (!alertaVencido && v.manutencaoInfo.proxTrocaOleoKm && v.quilometragemAtual >= v.manutencaoInfo.proxTrocaOleoKm) alertaVencido = true;
                if (v.manutencaoInfo.dataProxChecklist) { const d = new Date(v.manutencaoInfo.dataProxChecklist); if (d < inicioHoje) alertaVencido = true; else agendamentoFuturo = true; }
            }
            if (alertaVencido) alertasAtivosCount++; else if (agendamentoFuturo) manutencoesAgendadasCount++;
        });
        res.json({ totalVeiculos, alertasAtivos: alertasAtivosCount, manutencoesAgendadas: manutencoesAgendadasCount });
    } catch (error) { res.status(500).json({ message: "Erro stats." }); }
});
app.get('/api/dashboard/recent-activity', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    try {
        const proms = [
            db.collection('manutencoes').find().sort({ dataRealizacao: -1 }).limit(5).project({ _id: 1, veiculoPlaca: 1, tipoManutencao: 1, dataRealizacao: 1 }).toArray(),
            db.collection('checklists').find({status: "concluido"}).sort({ dataRealizacao: -1 }).limit(5).project({ _id: 1, veiculoPlaca: 1, realizadoPor: 1, dataRealizacao: 1, observacoesGerais: 1 }).toArray(),
            db.collection('abastecimentos').find().sort({ data: -1 }).limit(5).project({ _id: 1, veiculoPlaca: 1, litros: 1, data: 1 }).toArray()
        ];
        const [manutencoes, checklists, abastecimentos] = await Promise.all(proms);
        let activities = [
            ...manutencoes.map(m => ({ id: m._id, tipo: 'manutencao', descricao: `Manutenção (${m.tipoManutencao||'Geral'}) ${m.veiculoPlaca||''}`, data: m.dataRealizacao })),
            ...checklists.map(c => ({ id: c._id, tipo: 'checklist', descricao: `Checklist ${c.veiculoPlaca||''} por ${c.realizadoPor||'N/A'}. ${c.observacoesGerais||''}`, data: c.dataRealizacao })),
            ...abastecimentos.map(a => ({ id: a._id, tipo: 'abastecimento', descricao: `Abastecimento ${a.veiculoPlaca||''} (${a.litros.toFixed(1)}L)`, data: a.data }))
        ];
        activities.sort((a, b) => new Date(b.data) - new Date(a.data));
        res.json(activities.slice(0, 5));
    } catch (error) { res.status(500).json({ message: "Erro recent activity."}); }
});
// --- ROTAS DA API PARA VEÍCULOS ---
app.get('/api/veiculos', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    try {
        const veiculos = await db.collection('veiculos').find({}).sort({ dataCadastro: -1 }).toArray();
        res.status(200).json(veiculos);
    } catch (error) { res.status(500).json({ message: 'Erro ao buscar veículos.' }); }
});
app.post('/api/veiculos', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const d = req.body; 
    const p = (v, t) => (v !== undefined && v !== null && v !== '') ? (t === 'int' ? parseInt(v,10) : (t === 'date' ? new Date(Date.parse(v)) : v)) : null; // Ajuste para parse de data
    const novoVeiculo = {
        placa: (d.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), marca: (d.marca||'').trim(), modelo: (d.modelo||'').trim(),
        anoFabricacao: p(d.anoFabricacao, 'int'), anoModelo: p(d.anoModelo, 'int'), cor: d.cor ? d.cor.trim() : null,
        chassi: d.chassi ? d.chassi.trim() : null, renavam: d.renavam ? d.renavam.trim() : null,
        quilometragemAtual: p(d.quilometragemAtual, 'int'),
        manutencaoInfo: {
            proxTrocaOleoKm: p(d.oleoKm, 'int'), proxTrocaOleoData: p(d.oleoData, 'date'),
            frequenciaChecklistDias: p(d.frequenciaChecklist, 'int'),
            dataProxChecklist: (d.frequenciaChecklist && parseInt(d.frequenciaChecklist,10) > 0) ? new Date(new Date().setDate(new Date().getDate() + parseInt(d.frequenciaChecklist,10))) : null,
            ultimaTrocaOleoKm: null, ultimaTrocaOleoData: null, ultimoChecklistData: null
        }, dataCadastro: new Date()
    };
    if (!novoVeiculo.placa || !novoVeiculo.marca || !novoVeiculo.modelo || novoVeiculo.anoFabricacao === null || novoVeiculo.anoModelo === null || novoVeiculo.quilometragemAtual === null)
        return res.status(400).json({ message: "Campos obrigatórios não preenchidos." });
    try {
        if (await db.collection('veiculos').findOne({ placa: novoVeiculo.placa }))
            return res.status(409).json({ message: `Placa ${novoVeiculo.placa} já cadastrada.` });
        const result = await db.collection('veiculos').insertOne(novoVeiculo);
        res.status(201).json({ message: 'Veículo cadastrado!', veiculo: { _id: result.insertedId, ...novoVeiculo } });
    } catch (error) { res.status(500).json({ message: 'Erro ao cadastrar veículo.' }); }
});
app.delete('/api/veiculos/:id', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "ID inválido." });
    try {
        const result = await db.collection('veiculos').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) return res.status(404).json({ message: "Veículo não encontrado." });
        await db.collection('manutencoes').deleteMany({ veiculoId: new ObjectId(id) });
        await db.collection('checklists').deleteMany({ veiculoId: new ObjectId(id) });
        await db.collection('abastecimentos').deleteMany({ veiculoId: new ObjectId(id) });
        res.status(200).json({ message: "Veículo e seus registros associados foram excluídos." });
    } catch (error) { res.status(500).json({ message: 'Erro ao excluir veículo.' }); }
});
app.get('/api/veiculos/:id', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "ID inválido." });
    try {
        const veiculo = await db.collection('veiculos').findOne({ _id: new ObjectId(id) });
        if (!veiculo) return res.status(404).json({ message: "Veículo não encontrado." });
        res.status(200).json(veiculo);
    } catch (error) { res.status(500).json({ message: 'Erro ao buscar veículo.' }); }
});
app.put('/api/veiculos/:id', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "ID inválido." });
    const d = req.body;
    const p = (v, t) => (v !== undefined && v !== null && v !== '') ? (t === 'int' ? parseInt(v,10) : (t === 'date' ? new Date(Date.parse(v)) : v)) : undefined; // Ajuste para parse de data e retornar undefined
    const veiculoAtual = await db.collection('veiculos').findOne({ _id: new ObjectId(id) });
    if (!veiculoAtual) return res.status(404).json({ message: "Veículo não encontrado." });
    
    const $set = { dataAtualizacao: new Date() }; // Inicia com o campo de atualização
    if (d.placa !== undefined) $set.placa = d.placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (d.marca !== undefined) $set.marca = d.marca.trim();
    if (d.modelo !== undefined) $set.modelo = d.modelo.trim();
    if (d.anoFabricacao !== undefined) $set.anoFabricacao = p(d.anoFabricacao, 'int');
    if (d.anoModelo !== undefined) $set.anoModelo = p(d.anoModelo, 'int');
    if (d.cor !== undefined) $set.cor = d.cor ? d.cor.trim() : null;
    if (d.chassi !== undefined) $set.chassi = d.chassi ? d.chassi.trim() : null;
    if (d.renavam !== undefined) $set.renavam = d.renavam ? d.renavam.trim() : null;
    if (d.quilometragemAtual !== undefined) $set.quilometragemAtual = p(d.quilometragemAtual, 'int');
    
    if (d.oleoKm !== undefined) $set['manutencaoInfo.proxTrocaOleoKm'] = p(d.oleoKm, 'int'); 
    else if (d.oleoKm === null) $set['manutencaoInfo.proxTrocaOleoKm'] = null;

    if (d.oleoData !== undefined) $set['manutencaoInfo.proxTrocaOleoData'] = p(d.oleoData, 'date'); 
    else if (d.oleoData === null) $set['manutencaoInfo.proxTrocaOleoData'] = null;

    if (d.frequenciaChecklist !== undefined) {
        const freq = p(d.frequenciaChecklist, 'int');
        $set['manutencaoInfo.frequenciaChecklistDias'] = freq;
        if (freq && freq > 0) {
            const baseDate = (veiculoAtual.manutencaoInfo && veiculoAtual.manutencaoInfo.ultimoChecklistData) ? new Date(veiculoAtual.manutencaoInfo.ultimoChecklistData) : new Date();
            $set['manutencaoInfo.dataProxChecklist'] = new Date(baseDate.setDate(baseDate.getDate() + freq));
        } else { 
            $set['manutencaoInfo.dataProxChecklist'] = null; 
        }
    } else if (d.frequenciaChecklist === null) { 
         $set['manutencaoInfo.frequenciaChecklistDias'] = null; 
         $set['manutencaoInfo.dataProxChecklist'] = null; 
    }
    
    if (($set.placa !== undefined && !$set.placa) /* ...outras validações ... */ ) return res.status(400).json({ message: "Campos obrigatórios não podem ser vazios." });
    try {
        if ($set.placa && $set.placa !== veiculoAtual.placa) {
            if (await db.collection('veiculos').findOne({ placa: $set.placa, _id: { $ne: new ObjectId(id) } })) return res.status(409).json({ message: `Placa ${$set.placa} já em uso.` });
        }
        const result = await db.collection('veiculos').updateOne({ _id: new ObjectId(id) }, { $set });
        if (result.matchedCount === 0) return res.status(404).json({ message: "Veículo não atualizado." });
        res.status(200).json({ message: "Veículo atualizado." });
    } catch (error) { res.status(500).json({ message: 'Erro ao atualizar veículo.' }); }
});

// --- ROTAS DA API PARA MANUTENÇÕES ---
app.post('/api/checklists/iniciar', simpleAuthCheck, async (req, res) => { // ROTA ATUALIZADA
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { veiculoId } = req.body;
    if (!veiculoId || !ObjectId.isValid(veiculoId)) return res.status(400).json({ message: "ID do veículo inválido." });

    try {
        const veiculo = await db.collection('veiculos').findOne({ _id: new ObjectId(veiculoId) });
        if (!veiculo) return res.status(404).json({ message: "Veículo não encontrado." });

        const dataDeInicio = new Date(); // Usar a data atual para o início

        const novoChecklistPendente = {
            veiculoId: new ObjectId(veiculoId),
            veiculoPlaca: veiculo.placa,
            dataIniciado: dataDeInicio,
            status: "pendente", 
            itensVerificados: [], 
            dataRealizacao: null,
            quilometragem: null,
            realizadoPor: null,
            observacoesGerais: null
        };
        const result = await db.collection('checklists').insertOne(novoChecklistPendente);

        // ATUALIZAÇÃO: Após iniciar um checklist, considerar a data de início como a "última realização"
        // para que o agendamento original suma da lista de "próximos" até que este seja concluído.
        let updateVeiculoFields = {
            'manutencaoInfo.ultimoChecklistData': dataDeInicio // Data em que o checklist foi efetivamente "pego" para fazer
        };
        if (veiculo.manutencaoInfo && veiculo.manutencaoInfo.frequenciaChecklistDias) {
            const freqDias = parseInt(veiculo.manutencaoInfo.frequenciaChecklistDias, 10);
            if (freqDias > 0) {
                updateVeiculoFields['manutencaoInfo.dataProxChecklist'] = new Date(new Date(dataDeInicio).setDate(dataDeInicio.getDate() + freqDias));
            }
        }
        await db.collection('veiculos').updateOne({ _id: new ObjectId(veiculoId) }, { $set: updateVeiculoFields });

        res.status(201).json({ 
            message: 'Checklist iniciado e marcado como pendente! O agendamento original foi atualizado.', 
            checklist: { _id: result.insertedId, ...novoChecklistPendente }
        });
    } catch (error) {
        console.error("Erro ao iniciar checklist:", error);
        res.status(500).json({ message: "Erro ao iniciar checklist." });
    }
});
app.get('/api/checklists/pendentes', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    try {
        const pendentes = await db.collection('checklists').find({ status: "pendente" }).sort({ dataIniciado: -1 }).toArray();
        res.status(200).json(pendentes);
    } catch (error) { console.error("Erro buscar pendentes:", error); res.status(500).json({ message: "Erro buscar pendentes." }); }
});
app.post('/api/checklists/:id/registrar-resultado', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { id } = req.params; const { dataRealizacao, quilometragem, realizadoPor, observacoesGerais, itensVerificados } = req.body;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "ID checklist inválido." });
    if (!dataRealizacao || quilometragem === undefined || !realizadoPor || !Array.isArray(itensVerificados)) return res.status(400).json({ message: "Dados incompletos." });
    try {
        const checklist = await db.collection('checklists').findOne({ _id: new ObjectId(id), status: "pendente" });
        if (!checklist) return res.status(404).json({ message: "Checklist pendente não encontrado." });
        const veiculo = await db.collection('veiculos').findOne({ _id: new ObjectId(checklist.veiculoId) });
        if (!veiculo) return res.status(404).json({ message: "Veículo do checklist não encontrado." });
        const pKm = parseInt(quilometragem, 10);
        const update = { $set: { status: "concluido", dataRealizacao: new Date(Date.parse(dataRealizacao)), quilometragem: pKm, realizadoPor: realizadoPor.trim(), observacoesGerais: observacoesGerais ? observacoesGerais.trim() : null, itensVerificados } };
        await db.collection('checklists').updateOne({ _id: new ObjectId(id) }, update);
        let updateVeiculo = { 'manutencaoInfo.ultimoChecklistData': new Date(Date.parse(dataRealizacao)) };
        if (pKm > (veiculo.quilometragemAtual || 0)) updateVeiculo.quilometragemAtual = pKm;
        if (veiculo.manutencaoInfo && veiculo.manutencaoInfo.frequenciaChecklistDias) {
            const freq = parseInt(veiculo.manutencaoInfo.frequenciaChecklistDias, 10);
            if (freq > 0) updateVeiculo['manutencaoInfo.dataProxChecklist'] = new Date(new Date(Date.parse(dataRealizacao)).setDate(new Date(Date.parse(dataRealizacao)).getDate() + freq));
        }
        await db.collection('veiculos').updateOne({ _id: new ObjectId(checklist.veiculoId) }, { $set: updateVeiculo });
        res.status(200).json({ message: "Resultados registrados!" });
    } catch (error) { console.error("Erro registrar resultados checklist:", error); res.status(500).json({ message: "Erro registrar resultados." }); }
});
app.get('/api/checklists/historico', simpleAuthCheck, async (req, res) => { 
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { veiculoId, mes, ano } = req.query; 
    try {
        let query = { status: "concluido" }; 
        if (veiculoId && veiculoId !== 'todos') { if (!ObjectId.isValid(veiculoId)) return res.status(400).json({ message: "ID Veículo inválido." }); query.veiculoId = new ObjectId(veiculoId); }
        const dateFilter = getDateQuery(mes, ano); if (dateFilter.dateMatch) query.dataRealizacao = dateFilter.dateMatch;
        const historico = await db.collection('checklists').find(query).sort({ dataRealizacao: -1 }).toArray();
        const formatado = historico.map(c => ({ _id: c._id, veiculoId: c.veiculoId, veiculoPlaca: c.veiculoPlaca, dataRealizacao: c.dataRealizacao, quilometragem: c.quilometragem, realizadoPor: c.realizadoPor, observacoes: c.observacoesGerais || (c.itensVerificados && c.itensVerificados.some(i => i.statusItem !== 'OK') ? 'Itens com atenção' : 'Tudo OK') }));
        res.status(200).json(formatado);
    } catch (error) { console.error('Erro histórico checklists:', error); res.status(500).json({ message: 'Erro histórico checklists.' }); }
});
app.delete('/api/checklists/:id', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { id } = req.params; if (!ObjectId.isValid(id)) return res.status(400).json({ message: "ID inválido." });
    try {
        const result = await db.collection('checklists').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) return res.status(404).json({ message: "Checklist não encontrado." });
        res.status(200).json({ message: "Checklist excluído." });
    } catch (error) { console.error('Erro excluir checklist:', error); res.status(500).json({ message: 'Erro excluir checklist.' }); }
});

// --- ROTAS DA API PARA CHECKLISTS ---
// --- ROTAS DA API PARA CHECKLISTS ---

// POST /api/checklists/iniciar - Para marcar um checklist como pendente
app.post('/api/checklists/iniciar', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { veiculoId } = req.body;
    if (!veiculoId || !ObjectId.isValid(veiculoId)) return res.status(400).json({ message: "ID do veículo inválido." });

    try {
        const veiculo = await db.collection('veiculos').findOne({ _id: new ObjectId(veiculoId) });
        if (!veiculo) return res.status(404).json({ message: "Veículo não encontrado." });

        const dataDeInicio = new Date(); // Usar a data atual para o início

        const novoChecklistPendente = {
            veiculoId: new ObjectId(veiculoId),
            veiculoPlaca: veiculo.placa,
            dataIniciado: dataDeInicio,
            status: "pendente", // pendente, concluido
            itensVerificados: [], // Será preenchido ao registrar resultados
            dataRealizacao: null,
            quilometragem: null,
            realizadoPor: null,
            observacoesGerais: null
        };
        const result = await db.collection('checklists').insertOne(novoChecklistPendente);

        // ATUALIZAÇÃO: Após iniciar um checklist, considerar a data de início como a "última realização"
        // para que o agendamento original suma da lista de "próximos" até que este seja concluído.
        let updateVeiculoFields = {
            'manutencaoInfo.ultimoChecklistData': dataDeInicio 
        };
        if (veiculo.manutencaoInfo && veiculo.manutencaoInfo.frequenciaChecklistDias) {
            const freqDias = parseInt(veiculo.manutencaoInfo.frequenciaChecklistDias, 10);
            if (freqDias > 0) {
                updateVeiculoFields['manutencaoInfo.dataProxChecklist'] = new Date(new Date(dataDeInicio).setDate(dataDeInicio.getDate() + freqDias));
            }
        }
        // Apenas atualiza se houver campos para atualizar (evita $set vazio)
        if(Object.keys(updateVeiculoFields).length > 0) {
            await db.collection('veiculos').updateOne({ _id: new ObjectId(veiculoId) }, { $set: updateVeiculoFields });
        }
        

        res.status(201).json({ 
            message: 'Checklist iniciado e marcado como pendente! O agendamento original foi atualizado.', 
            checklist: { _id: result.insertedId, ...novoChecklistPendente }
        });
    } catch (error) {
        console.error("Erro ao iniciar checklist:", error);
        res.status(500).json({ message: "Erro ao iniciar checklist." });
    }
});

// GET /api/checklists/pendentes - Para listar checklists pendentes
app.get('/api/checklists/pendentes', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    try {
        const pendentes = await db.collection('checklists')
            .find({ status: "pendente" })
            .sort({ dataIniciado: -1 }) // Mais recentes primeiro
            .toArray();
        res.status(200).json(pendentes);
    } catch (error) {
        console.error("Erro ao buscar checklists pendentes:", error);
        res.status(500).json({ message: "Erro ao buscar checklists pendentes." });
    }
});

// POST /api/checklists/:id/registrar-resultado - Para finalizar um checklist pendente
app.post('/api/checklists/:id/registrar-resultado', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { id } = req.params; // ID do checklist pendente
    const { 
        dataRealizacao, 
        quilometragem, 
        realizadoPor, 
        observacoesGerais, 
        itensVerificados // Espera um array [{ nomeItem, statusItem, obsItem }]
    } = req.body;

    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "ID do checklist inválido." });
    if (!dataRealizacao || quilometragem === undefined || !realizadoPor || !Array.isArray(itensVerificados)) {
        return res.status(400).json({ message: "Dados incompletos para registrar resultado do checklist." });
    }

    try {
        const checklistPendente = await db.collection('checklists').findOne({ _id: new ObjectId(id), status: "pendente" });
        if (!checklistPendente) return res.status(404).json({ message: "Checklist pendente não encontrado ou já concluído." });

        const veiculo = await db.collection('veiculos').findOne({ _id: new ObjectId(checklistPendente.veiculoId) });
        if (!veiculo) return res.status(404).json({ message: "Veículo associado ao checklist não encontrado." });

        const parsedKm = parseInt(quilometragem, 10);
        if (isNaN(parsedKm) || parsedKm < 0) {
            return res.status(400).json({ message: "Quilometragem inválida." });
        }
        
        const dataRealizacaoDate = new Date(Date.parse(dataRealizacao)); // Garante que é um objeto Date

        const updateChecklistData = {
            $set: {
                status: "concluido",
                dataRealizacao: dataRealizacaoDate,
                quilometragem: parsedKm,
                realizadoPor: realizadoPor.trim(),
                observacoesGerais: observacoesGerais ? observacoesGerais.trim() : null,
                itensVerificados: itensVerificados 
            }
        };
        await db.collection('checklists').updateOne({ _id: new ObjectId(id) }, updateChecklistData);

        // Atualizar veículo com data do último checklist e recalcular próximo, e KM se necessário
        let updateVeiculoFields = {
            'manutencaoInfo.ultimoChecklistData': dataRealizacaoDate
        };
        if (parsedKm > (veiculo.quilometragemAtual || 0)) { // Atualiza KM do veículo apenas se for maior
            updateVeiculoFields.quilometragemAtual = parsedKm;
        }
        if (veiculo.manutencaoInfo && veiculo.manutencaoInfo.frequenciaChecklistDias) {
            const freqDias = parseInt(veiculo.manutencaoInfo.frequenciaChecklistDias, 10);
            if (freqDias > 0) {
                const proximaData = new Date(dataRealizacaoDate);
                proximaData.setDate(proximaData.getDate() + freqDias);
                updateVeiculoFields['manutencaoInfo.dataProxChecklist'] = proximaData;
            }
        }
        // Apenas atualiza se houver campos para atualizar
        if(Object.keys(updateVeiculoFields).length > 0) {
            await db.collection('veiculos').updateOne({ _id: new ObjectId(checklistPendente.veiculoId) }, { $set: updateVeiculoFields });
        }
        
        res.status(200).json({ message: "Resultados do checklist registrados com sucesso!" });
    } catch (error) {
        console.error("Erro ao registrar resultados do checklist:", error);
        res.status(500).json({ message: "Erro ao registrar resultados do checklist." });
    }
});

app.get('/api/manutencoes/historico', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { veiculoId, mes, ano } = req.query; // Atualizado para receber filtros
    try {
        let query = {};
        if (veiculoId && veiculoId !== 'todos') { 
            if (!ObjectId.isValid(veiculoId)) return res.status(400).json({ message: "ID Veículo inválido." }); 
            query.veiculoId = new ObjectId(veiculoId); 
        }
        const dateFilter = getDateQuery(mes, ano); // Usa o helper para data
        if (dateFilter.dateMatch) {
            query.dataRealizacao = dateFilter.dateMatch;
        }
        const historico = await db.collection('manutencoes').find(query).sort({ dataRealizacao: -1, dataRegistro: -1 }).toArray();
        res.status(200).json(historico);
    } catch (error) { 
        console.error('Erro ao buscar histórico de manutenções:', error); 
        res.status(500).json({ message: 'Erro ao buscar histórico de manutenções.' }); 
    }
});
app.delete('/api/checklists/:id', simpleAuthCheck, async (req, res) => { /* ...código mantido... */ });

// --- ROTAS DA API PARA ABASTECIMENTOS ---
// Esta rota será modificada no futuro para incluir a validação e uso da requisição
app.post('/api/abastecimentos', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { veiculoId, data, quilometragemAtual, litros, valorPorLitro, custoTotal, posto, observacoes } = req.body;
    if (!veiculoId || !data || !quilometragemAtual || !litros || !valorPorLitro) return res.status(400).json({ message: "Campos obrigatórios." });
    if (!ObjectId.isValid(veiculoId)) return res.status(400).json({ message: "ID veículo inválido." });
    const pKm = parseInt(quilometragemAtual, 10), pL = parseFloat(litros), pVl = parseFloat(valorPorLitro);
    let pCt = custoTotal ? parseFloat(custoTotal) : (pL * pVl);
    if (isNaN(pKm) || pKm < 0 || isNaN(pL) || pL <= 0 || isNaN(pVl) || pVl <= 0 || isNaN(pCt) || pCt < 0) return res.status(400).json({ message: "Valores numéricos inválidos." });
    try {
        const veiculo = await db.collection('veiculos').findOne({ _id: new ObjectId(veiculoId) });
        if (!veiculo) return res.status(404).json({ message: "Veículo não encontrado." });
        if (pKm < (veiculo.quilometragemAtual || 0)) return res.status(400).json({ message: `KM informada (${pKm.toLocaleString('pt-BR')}km) menor que a última registrada (${(veiculo.quilometragemAtual || 0).toLocaleString('pt-BR')}km).` });
        const novoAbastecimento = { veiculoId: new ObjectId(veiculoId), veiculoPlaca: veiculo.placa, data: new Date(Date.parse(data)), quilometragemAtual: pKm, litros: pL, valorPorLitro: pVl, custoTotal: pCt, posto: posto ? posto.trim() : null, observacoes: observacoes ? observacoes.trim() : null, dataRegistro: new Date() };
        const result = await db.collection('abastecimentos').insertOne(novoAbastecimento);
        await db.collection('veiculos').updateOne({ _id: new ObjectId(veiculoId) }, { $set: { quilometragemAtual: pKm } });
        let alertaOleoMsg = null; if (veiculo.manutencaoInfo && veiculo.manutencaoInfo.proxTrocaOleoKm && pKm >= veiculo.manutencaoInfo.proxTrocaOleoKm) alertaOleoMsg = `Atenção: Troca de óleo recomendada! KM atual (${pKm.toLocaleString('pt-BR')}km) atingiu ou ultrapassou limite (${veiculo.manutencaoInfo.proxTrocaOleoKm.toLocaleString('pt-BR')}km).`;
        res.status(201).json({ message: 'Abastecimento registrado!', abastecimento: { _id: result.insertedId, ...novoAbastecimento }, alertaOleo: alertaOleoMsg });
    } catch (error) { console.error('Erro registrar abastecimento:', error); res.status(500).json({ message: 'Erro registrar abastecimento.' }); }
});

// --- ROTAS DA API PARA RELATÓRIOS ---
app.get('/api/relatorios/gastos-detalhados', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { veiculoId, mes, ano } = req.query;
    try {
        let queryManutencoes = {}; let queryAbastecimentos = {};
        if (veiculoId && veiculoId !== 'todos') { if (!ObjectId.isValid(veiculoId)) return res.status(400).json({ message: "ID veículo inválido." }); queryManutencoes.veiculoId = new ObjectId(veiculoId); queryAbastecimentos.veiculoId = new ObjectId(veiculoId); }
        const dateFilterM = getDateQuery(mes, ano); if (dateFilterM.dateMatch) queryManutencoes.dataRealizacao = dateFilterM.dateMatch;
        const dateFilterA = getDateQuery(mes, ano); if (dateFilterA.dateMatch) queryAbastecimentos.data = dateFilterA.dateMatch; // Campo 'data' para abastecimentos
        const manutencoes = await db.collection('manutencoes').find(queryManutencoes).toArray();
        const abastecimentos = await db.collection('abastecimentos').find(queryAbastecimentos).toArray();
        let gastosCombinados = []; let totalGeral = 0;
        manutencoes.forEach(m => { if (m.custo && m.custo > 0) { gastosCombinados.push({ _id: m._id, data: m.dataRealizacao, veiculoId: m.veiculoId, veiculoPlaca: m.veiculoPlaca, tipoGasto: "Manutenção", descricaoGasto: m.tipoManutencao || m.descricao || "Manutenção geral", valorGasto: parseFloat(m.custo.toFixed(2)) }); totalGeral += m.custo; } });
        abastecimentos.forEach(a => { if (a.custoTotal && a.custoTotal > 0) { gastosCombinados.push({ _id: a._id, data: a.data, veiculoId: a.veiculoId, veiculoPlaca: a.veiculoPlaca, tipoGasto: "Combustível", descricaoGasto: `Abastecimento ${a.litros.toFixed(2)}L (${a.posto || 'N/I'})`, valorGasto: parseFloat(a.custoTotal.toFixed(2)) }); totalGeral += a.custoTotal; } });
        gastosCombinados.sort((x, y) => new Date(y.data) - new Date(x.data)); 
        res.status(200).json({ detalhes: gastosCombinados, sumario: { totalGastos: parseFloat(totalGeral.toFixed(2)) } });
    } catch (error) { console.error("Erro gastos detalhados:", error); res.status(500).json({ message: "Erro gastos detalhados." }); }
});

app.get('/api/relatorios/gastos-mensais', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { veiculoId, ano } = req.query; const targetAno = (ano && ano !== 'todos') ? parseInt(ano) : new Date().getFullYear();
    try {
        const baseDateMatch = { $gte: new Date(Date.UTC(targetAno, 0, 1)), $lt: new Date(Date.UTC(targetAno + 1, 0, 1)) };
        let matchAbastecimento = { data: baseDateMatch, custoTotal: { $gt: 0} };
        let matchManutencao = { dataRealizacao: baseDateMatch, custo: { $gt: 0 } };
        if (veiculoId && veiculoId !== 'todos') { if (!ObjectId.isValid(veiculoId)) return res.status(400).json({ message: "ID inválido." }); matchAbastecimento.veiculoId = new ObjectId(veiculoId); matchManutencao.veiculoId = new ObjectId(veiculoId); }
        
        // Usando timezone no $month pode ser específico do MongoDB Atlas ou versões mais recentes.
        // Se der erro, pode ser necessário buscar os dados e agrupar no JS, ou ajustar para não usar timezone na query.
        const groupStageAbastecimentos = { $group: { _id: { mes: { $month: "$data" } }, totalCombustivel: { $sum: "$custoTotal" } } };
        const groupStageManutencoes = { $group: { _id: { mes: { $month: "$dataRealizacao" } }, totalManutencao: { $sum: "$custo" } } };
        const sortStage = { $sort: { "_id.mes": 1 } }; 
        const gastosCombustivel = await db.collection('abastecimentos').aggregate([ { $match: matchAbastecimento } , groupStageAbastecimentos, sortStage]).toArray();
        const gastosManutencao = await db.collection('manutencoes').aggregate([ { $match: matchManutencao }, groupStageManutencoes, sortStage]).toArray();
        const mesesNomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
        let dataCombustivel = Array(12).fill(0); let dataManutencao = Array(12).fill(0);
        gastosCombustivel.forEach(item => { dataCombustivel[item._id.mes - 1] = parseFloat(item.totalCombustivel.toFixed(2)); });
        gastosManutencao.forEach(item => { dataManutencao[item._id.mes - 1] = parseFloat(item.totalManutencao.toFixed(2)); });
        let datasets = [ { label: 'Gastos com Combustível', data: dataCombustivel, backgroundColor: 'rgba(255, 159, 64, 0.5)', borderColor: 'rgba(255, 159, 64, 1)', borderWidth: 1 }, { label: 'Gastos com Manutenção', data: dataManutencao, backgroundColor: 'rgba(75, 192, 192, 0.5)', borderColor: 'rgba(75, 192, 192, 1)', borderWidth: 1 } ];
        res.status(200).json({ labels: mesesNomes, datasets });
    } catch (error) { console.error("Erro gastos mensais:", error); res.status(500).json({ message: "Erro gastos mensais." }); }
});

app.get('/api/relatorios/analise-combustivel', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { veiculoId, mes, ano } = req.query;
    console.log(`[DEPURAÇÃO ANÁLISE COMBUSTÍVEL] Filtros recebidos: VeiculoID=${veiculoId}, Mes=${mes}, Ano=${ano}`);
    try {
        let queryAbastecimentos = {}; 
        if (veiculoId && veiculoId !== 'todos') { 
            if (!ObjectId.isValid(veiculoId)) return res.status(400).json({ message: "ID inválido." }); 
            queryAbastecimentos.veiculoId = new ObjectId(veiculoId); 
        }
        const dateFilter = getDateQuery(mes, ano); 
        if (dateFilter.dateMatch) {
            queryAbastecimentos.data = dateFilter.dateMatch;
        }
        console.log("[DEPURAÇÃO ANÁLISE COMBUSTÍVEL] Query MongoDB:", JSON.stringify(queryAbastecimentos));

        const abastecimentos = await db.collection('abastecimentos')
            .find(queryAbastecimentos)
            .sort({ veiculoId: 1, data: 1, quilometragemAtual: 1 }) // ESSENCIAL PARA O CÁLCULO CORRETO
            .toArray();
        
        console.log(`[DEPURAÇÃO ANÁLISE COMBUSTÍVEL] Abastecimentos encontrados: ${abastecimentos.length}`);

        let detalhesFormatados = []; 
        let sumario = { totalGastoCombustivel: 0, totalLitros: 0, totalKmRodados: 0 }; 
        let ultimoKmPorVeiculo = {};
        let trechosValidosParaConsumo = 0;

        for (const a of abastecimentos) {
            sumario.totalGastoCombustivel += a.custoTotal; 
            sumario.totalLitros += a.litros; 
            const vIdStr = a.veiculoId.toString(); 
            let kmRodados = null; 
            let consumoNoTrecho = null;

            console.log(`[DEPURAÇÃO ANÁLISE COMBUSTÍVEL] Processando abastecimento: Veículo ${a.veiculoPlaca}, Data ${a.data}, KM ${a.quilometragemAtual}, Litros ${a.litros}`);
            console.log(`[DEPURAÇÃO ANÁLISE COMBUSTÍVEL] ultimoKmPorVeiculo[${vIdStr}]: ${ultimoKmPorVeiculo[vIdStr]}`);

            if (ultimoKmPorVeiculo[vIdStr] !== undefined && a.quilometragemAtual > ultimoKmPorVeiculo[vIdStr]) { 
                kmRodados = a.quilometragemAtual - ultimoKmPorVeiculo[vIdStr]; 
                sumario.totalKmRodados += kmRodados; 
                trechosValidosParaConsumo++;
                console.log(`[DEPURAÇÃO ANÁLISE COMBUSTÍVEL] KM Rodados neste trecho: ${kmRodados}`);
                if (a.litros > 0) { 
                    consumoNoTrecho = parseFloat((kmRodados / a.litros).toFixed(2)); 
                } 
            } else {
                console.log(`[DEPURAÇÃO ANÁLISE COMBUSTÍVEL] Não calculou KM rodados. ultimoKm: ${ultimoKmPorVeiculo[vIdStr]}, atualKm: ${a.quilometragemAtual}`);
            }
            
            detalhesFormatados.push({ ...a, kmRodados: kmRodados, consumoNoTrecho: consumoNoTrecho }); 
            ultimoKmPorVeiculo[vIdStr] = a.quilometragemAtual;
        }
        
        console.log(`[DEPURAÇÃO ANÁLISE COMBUSTÍVEL] Final - Total KM Rodados: ${sumario.totalKmRodados}, Trechos Válidos: ${trechosValidosParaConsumo}, Total Litros: ${sumario.totalLitros}`);

        sumario.totalGastoCombustivel = parseFloat(sumario.totalGastoCombustivel.toFixed(2)); 
        sumario.totalLitros = parseFloat(sumario.totalLitros.toFixed(2)); 
        sumario.totalKmRodados = parseFloat(sumario.totalKmRodados.toFixed(2));
        sumario.consumoMedioGeral = sumario.totalLitros > 0 && sumario.totalKmRodados > 0 ? parseFloat((sumario.totalKmRodados / sumario.totalLitros).toFixed(2)) : 0;
        sumario.custoMedioPorKm = sumario.totalKmRodados > 0 ? parseFloat((sumario.totalGastoCombustivel / sumario.totalKmRodados).toFixed(2)) : 0;
        sumario.precoMedioLitro = sumario.totalLitros > 0 ? parseFloat((sumario.totalGastoCombustivel / sumario.totalLitros).toFixed(3)) : 0;
        
        res.status(200).json({ detalhes: detalhesFormatados.sort((x,y) => new Date(y.data) - new Date(x.data)), sumario });
    } catch (error) { 
        console.error("Erro analise combustivel:", error); 
        res.status(500).json({ message: "Erro analise combustivel." }); 
    }
});


// --- ROTAS DA API PARA REQUISIÇÕES ---
app.post('/api/requisicoes', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { requisicaoId: requisicaoIdUsuario, entreguePara } = req.body; // Renomeado para clareza no backend

    if (!requisicaoIdUsuario || !entreguePara) {
        return res.status(400).json({ message: "ID da Requisição e 'Entregue Para' são obrigatórios." });
    }

    try {
        const requisicoesCollection = db.collection('requisicoes');
        // Verifica se o ID da requisição fornecido pelo usuário já existe
        const existingRequisicao = await requisicoesCollection.findOne({ idRequisicaoUsuario: requisicaoIdUsuario.trim() });
        if (existingRequisicao) {
            return res.status(409).json({ message: `O ID de Requisição '${requisicaoIdUsuario}' já existe.` });
        }

        const novaRequisicao = {
            idRequisicaoUsuario: requisicaoIdUsuario.trim(),
            entreguePara: entreguePara.trim(),
            dataCriacao: new Date(),
            status: "disponivel", // Status inicial
            abastecimentoIdAssociado: null,
            dataUtilizacao: null
        };
        const result = await requisicoesCollection.insertOne(novaRequisicao);
        res.status(201).json({ 
            message: "Requisição cadastrada com sucesso!", 
            requisicao: { _id: result.insertedId, ...novaRequisicao }
        });
    } catch (error) {
        console.error("Erro ao cadastrar requisição:", error);
        res.status(500).json({ message: "Erro interno ao cadastrar requisição." });
    }
});

app.get('/api/requisicoes', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { status, search } = req.query;
    
    try {
        let query = {};
        if (status && status !== 'todas') {
            query.status = status; // 'disponivel' ou 'utilizada'
        }
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { idRequisicaoUsuario: searchRegex },
                { entreguePara: searchRegex }
            ];
        }
        const requisicoes = await db.collection('requisicoes').find(query).sort({ dataCriacao: -1 }).toArray();
        res.status(200).json(requisicoes);
    } catch (error) {
        console.error("Erro ao listar requisições:", error);
        res.status(500).json({ message: "Erro interno ao listar requisições." });
    }
});

app.get('/api/requisicoes/disponiveis', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    try {
        const disponiveis = await db.collection('requisicoes')
            .find({ status: "disponivel" })
            .sort({ dataCriacao: 1 }) // Mais antigas primeiro, talvez? Ou por ID.
            .project({ idRequisicaoUsuario: 1, entreguePara: 1 }) // Retorna apenas o ID do usuário e para quem foi entregue
            .toArray();
        res.status(200).json(disponiveis);
    } catch (error) {
        console.error("Erro ao listar requisições disponíveis:", error);
        res.status(500).json({ message: "Erro interno ao listar requisições disponíveis." });
    }
});

// (Opcional) Rota para excluir uma requisição, caso necessário no gerenciamento
app.delete('/api/requisicoes/:id', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "ID de requisição inválido." });

    try {
        const requisicao = await db.collection('requisicoes').findOne({ _id: new ObjectId(id) });
        if (!requisicao) {
            return res.status(404).json({ message: "Requisição não encontrada." });
        }
        // Regra de negócio: não permitir excluir se já estiver utilizada?
        if (requisicao.status === 'utilizada') {
            return res.status(400).json({ message: "Não é possível excluir uma requisição que já foi utilizada." });
        }

        const result = await db.collection('requisicoes').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Requisição não encontrada para exclusão." });
        }
        res.status(200).json({ message: "Requisição excluída com sucesso." });
    } catch (error) {
        console.error("Erro ao excluir requisição:", error);
        res.status(500).json({ message: "Erro interno ao excluir requisição." });
    }
});


async function startServer() {
    await connectDB();
    app.listen(PORT, () => {
        console.log(`Servidor backend GPX7 v2 rodando na porta ${PORT} 🚀`);
        if (process.env.NODE_ENV !== 'production' && !process.env.RENDER) {
            console.log(`Acesse localmente em http://localhost:${PORT}`);
        }
    });
}

startServer();
