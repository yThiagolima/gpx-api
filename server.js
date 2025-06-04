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
        db = client.db("GPX7_DB"); // Certifique-se que "GPX7_DB" é o nome do seu banco na URI
        console.log("Conectado com sucesso ao MongoDB! 🥭");
    } catch (err) {
        console.error("Falha ao conectar com o MongoDB ❌", err);
        process.exit(1);
    }
}

// --- Middlewares ---
app.use(cors());
app.use(express.json());

// --- Helper para criar query de data ---
function getDateQuery(mes, ano) {
    const query = {};
    if (ano && ano !== 'todos') {
        const year = parseInt(ano);
        let startDate, endDate;
        if (mes && mes !== 'todos') {
            const month = parseInt(mes) - 1; // Meses em JS são 0-indexed
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
    if (!db) {
        return res.status(500).json({ message: "Erro interno do servidor: Banco de dados não conectado." });
    }
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ message: 'Nome de usuário, email e senha são obrigatórios.' });
    if (username.length < 3) return res.status(400).json({ message: 'Nome de usuário deve ter pelo menos 3 caracteres.' });
    if (password.length < 6) return res.status(400).json({ message: 'A senha deve ter pelo menos 6 caracteres.' });
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) return res.status(400).json({ message: 'Nome de usuário deve conter apenas letras, números e os caracteres "_", ".", "-".' });
    if (!/\S+@\S+\.\S+/.test(email)) return res.status(400).json({ message: 'Formato de email inválido.' });
    try {
        const usersCollection = db.collection('users');
        const usernameInputLower = username.toLowerCase();
        const emailInputLower = email.toLowerCase();
        const existingUser = await usersCollection.findOne({ $or: [{ username: usernameInputLower }, { email: emailInputLower }] });
        if (existingUser) {
            if (existingUser.username === usernameInputLower) return res.status(409).json({ message: 'Este nome de usuário já está em uso.' });
            if (existingUser.email === emailInputLower) return res.status(409).json({ message: 'Este email já está cadastrado.' });
        }
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const newUser = { username: username, email: emailInputLower, password: hashedPassword, createdAt: new Date() };
        const result = await usersCollection.insertOne(newUser);
        console.log('Novo usuário registrado:', newUser.username, 'Email:', newUser.email, 'ID:', result.insertedId);
        res.status(201).json({ message: 'Usuário registrado com sucesso!', user: { id: result.insertedId, username: newUser.username, email: newUser.email } });
    } catch (error) {
        console.error('Erro ao registrar usuário:', error);
        res.status(500).json({ message: 'Erro interno ao tentar registrar usuário.' });
    }
});

// --- Rota de LOGIN ---
app.post('/login', async (req, res) => {
    if (!db) { return res.status(500).json({ message: "Erro interno do servidor: Banco de dados não conectado." }); }
    const { loginIdentifier, password } = req.body;
    if (!loginIdentifier || !password) { return res.status(400).json({ message: 'Identificador de login (usuário/email) e senha são obrigatórios.' }); }
    try {
        const usersCollection = db.collection('users');
        const loginIdentifierLower = loginIdentifier.toLowerCase();
        const user = await usersCollection.findOne({ $or: [{ username: { $regex: new RegExp(`^${loginIdentifierLower}$`, 'i') } }, { email: loginIdentifierLower }] });
        if (!user) { return res.status(401).json({ message: 'Credenciais inválidas.' }); }
        const isPasswordMatch = await bcrypt.compare(password, user.password);
        if (!isPasswordMatch) { return res.status(401).json({ message: 'Credenciais inválidas.' }); }
        console.log('Login bem-sucedido para:', user.username);
        res.status(200).json({ message: 'Login bem-sucedido!', user: { id: user._id, username: user.username, email: user.email } });
    } catch (error) {
        console.error('Erro durante o login:', error);
        res.status(500).json({ message: 'Erro interno ao tentar fazer login.' });
    }
});

// --- Middleware de Autenticação Placeholder ---
const simpleAuthCheck = (req, res, next) => { next(); };

// --- ROTAS DA API PARA A DASHBOARD ---
// ... (Mantidas como na última versão completa)
app.get('/api/dashboard/stats', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    try {
        const totalVeiculos = await db.collection('veiculos').countDocuments();
        const hoje = new Date();
        const inicioHoje = new Date(new Date().setUTCHours(0, 0, 0, 0)); 

        const veiculosParaAlerta = await db.collection('veiculos').find({
            $or: [
                { 'manutencaoInfo.proxTrocaOleoData': { $exists: true, $ne: null } },
                { 'manutencaoInfo.proxTrocaOleoKm': { $exists: true, $ne: null } },
                { 'manutencaoInfo.dataProxChecklist': { $exists: true, $ne: null } }
            ]
        }).toArray();

        let alertasAtivosCount = 0;
        let manutencoesAgendadasCount = 0;

        veiculosParaAlerta.forEach(v => {
            let temAlertaVencidoEsteVeiculo = false;
            let temAgendamentoFuturoEsteVeiculo = false;

            if (v.manutencaoInfo) {
                if (v.manutencaoInfo.proxTrocaOleoData) {
                    const dataOleo = new Date(v.manutencaoInfo.proxTrocaOleoData);
                    if (dataOleo < inicioHoje) temAlertaVencidoEsteVeiculo = true;
                    else temAgendamentoFuturoEsteVeiculo = true;
                }
                if (v.manutencaoInfo.proxTrocaOleoKm && v.quilometragemAtual >= v.manutencaoInfo.proxTrocaOleoKm) {
                    temAlertaVencidoEsteVeiculo = true;
                }
                if (v.manutencaoInfo.dataProxChecklist) {
                    const dataCheck = new Date(v.manutencaoInfo.dataProxChecklist);
                    if (dataCheck < inicioHoje) temAlertaVencidoEsteVeiculo = true;
                    else temAgendamentoFuturoEsteVeiculo = true;
                }
            }
            if (temAlertaVencidoEsteVeiculo) alertasAtivosCount++;
            else if (temAgendamentoFuturoEsteVeiculo) { 
                 manutencoesAgendadasCount++;
            }
        });
        
        const stats = {
            totalVeiculos: totalVeiculos,
            alertasAtivos: alertasAtivosCount, 
            manutencoesAgendadas: manutencoesAgendadasCount 
        };
        res.json(stats);
    } catch (error) {
        console.error("Erro em /api/dashboard/stats:", error);
        res.status(500).json({ message: "Erro ao buscar estatísticas."});
    }
});

app.get('/api/dashboard/recent-activity', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    try {
        const manutencoesPromise = db.collection('manutencoes').find().sort({ dataRealizacao: -1 }).limit(5).project({ _id: 1, veiculoPlaca: 1, tipoManutencao: 1, dataRealizacao: 1 }).toArray();
        const checklistsPromise = db.collection('checklists').find().sort({ dataRealizacao: -1 }).limit(5).project({ _id: 1, veiculoPlaca: 1, realizadoPor: 1, dataRealizacao: 1 }).toArray();
        const abastecimentosPromise = db.collection('abastecimentos').find().sort({ data: -1 }).limit(5).project({ _id: 1, veiculoPlaca: 1, litros: 1, data: 1 }).toArray();
        const [manutencoesRecentes, checklistsRecentes, abastecimentosRecentes] = await Promise.all([manutencoesPromise, checklistsPromise, abastecimentosPromise]);
        let activities = [];
        manutencoesRecentes.forEach(m => activities.push({ id: m._id, tipo: 'manutencao', descricao: `Manutenção (${m.tipoManutencao || 'Geral'}) ${m.veiculoPlaca || ''}`, data: m.dataRealizacao }));
        checklistsRecentes.forEach(c => activities.push({ id: c._id, tipo: 'checklist', descricao: `Checklist ${c.veiculoPlaca || ''} por ${c.realizadoPor || 'N/A'}`, data: c.dataRealizacao }));
        abastecimentosRecentes.forEach(a => activities.push({ id: a._id, tipo: 'abastecimento', descricao: `Abastecimento ${a.veiculoPlaca || ''} (${a.litros.toFixed(1)}L)`, data: a.data }));
        activities.sort((a, b) => new Date(b.data) - new Date(a.data));
        res.json(activities.slice(0, 5));
    } catch (error) {
        console.error("Erro em /api/dashboard/recent-activity:", error);
        res.status(500).json({ message: "Erro ao buscar atividades."});
    }
});

// --- ROTAS DA API PARA VEÍCULOS ---
// ... (Mantidas como na última versão completa)
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
    const p = (v, t) => (v !== undefined && v !== null && v !== '') ? (t === 'int' ? parseInt(v,10) : (t === 'date' ? new Date(v) : v)) : null;
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
    const p = (v, t) => (v !== undefined && v !== null && v !== '') ? (t === 'int' ? parseInt(v,10) : (t === 'date' ? new Date(v) : v)) : undefined;
    const veiculoAtual = await db.collection('veiculos').findOne({ _id: new ObjectId(id) });
    if (!veiculoAtual) return res.status(404).json({ message: "Veículo não encontrado." });
    const updatedFields = { dataAtualizacao: new Date() };
    if (d.placa !== undefined) updatedFields.placa = d.placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (d.marca !== undefined) updatedFields.marca = d.marca.trim();
    if (d.modelo !== undefined) updatedFields.modelo = d.modelo.trim();
    if (d.anoFabricacao !== undefined) updatedFields.anoFabricacao = p(d.anoFabricacao, 'int');
    if (d.anoModelo !== undefined) updatedFields.anoModelo = p(d.anoModelo, 'int');
    if (d.cor !== undefined) updatedFields.cor = d.cor ? d.cor.trim() : null;
    if (d.chassi !== undefined) updatedFields.chassi = d.chassi ? d.chassi.trim() : null;
    if (d.renavam !== undefined) updatedFields.renavam = d.renavam ? d.renavam.trim() : null;
    if (d.quilometragemAtual !== undefined) updatedFields.quilometragemAtual = p(d.quilometragemAtual, 'int');
    if (d.oleoKm !== undefined) updatedFields['manutencaoInfo.proxTrocaOleoKm'] = p(d.oleoKm, 'int'); else if (d.oleoKm === null) updatedFields['manutencaoInfo.proxTrocaOleoKm'] = null;
    if (d.oleoData !== undefined) updatedFields['manutencaoInfo.proxTrocaOleoData'] = p(d.oleoData, 'date'); else if (d.oleoData === null) updatedFields['manutencaoInfo.proxTrocaOleoData'] = null;
    if (d.frequenciaChecklist !== undefined) {
        const freq = p(d.frequenciaChecklist, 'int');
        updatedFields['manutencaoInfo.frequenciaChecklistDias'] = freq;
        if (freq && freq > 0) {
            const baseDate = veiculoAtual.manutencaoInfo.ultimoChecklistData || new Date();
            updatedFields['manutencaoInfo.dataProxChecklist'] = new Date(new Date(baseDate).setDate(new Date(baseDate).getDate() + freq));
        } else { updatedFields['manutencaoInfo.dataProxChecklist'] = null; }
    } else if (d.frequenciaChecklist === null) { updatedFields['manutencaoInfo.frequenciaChecklistDias'] = null; updatedFields['manutencaoInfo.dataProxChecklist'] = null; }
    if ((updatedFields.placa !== undefined && !updatedFields.placa) || (updatedFields.marca !== undefined && !updatedFields.marca) || (updatedFields.modelo !== undefined && !updatedFields.modelo) || (updatedFields.anoFabricacao !== undefined && updatedFields.anoFabricacao === null) || (updatedFields.anoModelo !== undefined && updatedFields.anoModelo === null) || (updatedFields.quilometragemAtual !== undefined && updatedFields.quilometragemAtual === null) ) return res.status(400).json({ message: "Campos obrigatórios não podem ser vazios." });
    try {
        if (updatedFields.placa && updatedFields.placa !== veiculoAtual.placa) {
            if (await db.collection('veiculos').findOne({ placa: updatedFields.placa, _id: { $ne: new ObjectId(id) } })) return res.status(409).json({ message: `Placa ${updatedFields.placa} já em uso.` });
        }
        const result = await db.collection('veiculos').updateOne({ _id: new ObjectId(id) }, { $set: updatedFields });
        if (result.matchedCount === 0) return res.status(404).json({ message: "Veículo não atualizado." });
        res.status(200).json({ message: "Veículo atualizado." });
    } catch (error) { res.status(500).json({ message: 'Erro ao atualizar veículo.' }); }
});

// --- ROTAS DA API PARA MANUTENÇÕES ---
// ... (Mantidas como na última versão completa, com statusAlerta)
app.get('/api/manutencoes/proximas', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    try {
        const veiculos = await db.collection('veiculos').find({}).toArray();
        const inicioHoje = new Date(new Date().setUTCHours(0, 0, 0, 0)); 
        let proximasEAlertas = [];

        veiculos.forEach(v => {
            if (v.manutencaoInfo) {
                let statusOleo = "OK"; let vencidoKmOleo = false; let vencidoDataOleo = false;
                let dataOleoConsiderada = v.manutencaoInfo.proxTrocaOleoData ? new Date(v.manutencaoInfo.proxTrocaOleoData) : null;

                if (v.manutencaoInfo.proxTrocaOleoKm && v.quilometragemAtual >= v.manutencaoInfo.proxTrocaOleoKm) vencidoKmOleo = true;
                if (dataOleoConsiderada && dataOleoConsiderada < inicioHoje) vencidoDataOleo = true;

                if (vencidoKmOleo && vencidoDataOleo) statusOleo = "VENCIDO_DATA_KM";
                else if (vencidoKmOleo) statusOleo = "VENCIDO_KM";
                else if (vencidoDataOleo) statusOleo = "VENCIDO_DATA";
                
                if (v.manutencaoInfo.proxTrocaOleoKm || dataOleoConsiderada ) {
                     if (statusOleo !== "OK" || (dataOleoConsiderada && dataOleoConsiderada >= inicioHoje ) ) {
                        proximasEAlertas.push({ _id: v._id.toString() + '_oleo', veiculoId: v._id.toString(), veiculoPlaca: v.placa, tipo: 'Troca de Óleo',
                            descricao: `Prev. Data: ${dataOleoConsiderada ? dataOleoConsiderada.toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : 'N/A'}. Prev. KM: ${v.manutencaoInfo.proxTrocaOleoKm ? v.manutencaoInfo.proxTrocaOleoKm.toLocaleString('pt-BR') : 'N/A'}. KM Atual: ${v.quilometragemAtual.toLocaleString('pt-BR')}.`,
                            dataPrevista: v.manutencaoInfo.proxTrocaOleoData, kmPrevisto: v.manutencaoInfo.proxTrocaOleoKm, kmAtual: v.quilometragemAtual, statusAlerta: statusOleo 
                        });
                    }
                }
                let statusChecklist = "OK";
                let dataCheckConsiderada = v.manutencaoInfo.dataProxChecklist ? new Date(v.manutencaoInfo.dataProxChecklist) : null;
                if (dataCheckConsiderada) {
                    if (dataCheckConsiderada < inicioHoje) statusChecklist = "VENCIDO_DATA";
                     if (statusChecklist !== "OK" || dataCheckConsiderada >= inicioHoje) {
                        proximasEAlertas.push({ _id: v._id.toString() + '_checklist', veiculoId: v._id.toString(), veiculoPlaca: v.placa, tipo: 'Checklist',
                            descricao: `Previsto para: ${dataCheckConsiderada.toLocaleDateString('pt-BR', {timeZone: 'UTC'})}. Freq.: ${v.manutencaoInfo.frequenciaChecklistDias || 'N/A'} dias.`,
                            dataPrevista: v.manutencaoInfo.dataProxChecklist, statusAlerta: statusChecklist
                        });
                    }
                }
            }
        });
        proximasEAlertas.sort((a, b) => {
            const pS = (s) => (s && s.startsWith("VENCIDO")) ? 0 : 1;
            if (pS(a.statusAlerta) !== pS(b.statusAlerta)) return pS(a.statusAlerta) - pS(b.statusAlerta);
            const dA = a.dataPrevista ? new Date(a.dataPrevista) : new Date(8640000000000000); 
            const dB = b.dataPrevista ? new Date(b.dataPrevista) : new Date(8640000000000000);
            return dA.getTime() - dB.getTime();
        });
        res.status(200).json(proximasEAlertas);
    } catch (error) { console.error('Erro próximas manutenções:', error); res.status(500).json({ message: 'Erro próximas manutenções.' }); }
});
app.get('/api/manutencoes/historico', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { search } = req.query;
    try {
        const query = {}; if (search) { const sr = new RegExp(search, 'i'); query.$or = [ { veiculoPlaca: sr }, { tipoManutencao: sr }, { descricao: sr } ]; }
        const historico = await db.collection('manutencoes').find(query).sort({ dataRealizacao: -1, dataRegistro: -1 }).toArray();
        res.status(200).json(historico);
    } catch (error) { console.error('Erro histórico manutenções:', error); res.status(500).json({ message: 'Erro histórico.' }); }
});
app.post('/api/manutencoes', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { veiculoId, veiculoPlaca, tipoManutencao, dataRealizacao, custo, descricao, quilometragem, realizadaPor } = req.body;
    if (!veiculoId || !veiculoPlaca || !tipoManutencao || !dataRealizacao) return res.status(400).json({ message: 'Campos obrigatórios.' });
    if (!ObjectId.isValid(veiculoId)) return res.status(400).json({ message: "ID veículo inválido." });
    try {
        const veiculo = await db.collection('veiculos').findOne({ _id: new ObjectId(veiculoId) });
        if (!veiculo) return res.status(404).json({ message: "Veículo não encontrado." });
        const novaManutencao = {
            veiculoId: new ObjectId(veiculoId), veiculoPlaca: veiculoPlaca.toUpperCase().replace(/[^A-Z0-9]/g, ''),
            tipoManutencao: tipoManutencao.trim(), dataRealizacao: new Date(dataRealizacao),
            custo: custo ? parseFloat(custo) : null, descricao: descricao ? descricao.trim() : null,
            quilometragem: quilometragem ? parseInt(quilometragem, 10) : null,
            realizadaPor: realizadaPor ? realizadaPor.trim() : null, dataRegistro: new Date()
        };
        const result = await db.collection('manutencoes').insertOne(novaManutencao);
        let updateFields = {}; const kmManut = novaManutencao.quilometragem;
        if (kmManut && kmManut > (veiculo.quilometragemAtual || 0) ) updateFields.quilometragemAtual = kmManut;
        if (tipoManutencao.toLowerCase().includes('óleo') || tipoManutencao.toLowerCase().includes('oleo')) {
            updateFields['manutencaoInfo.ultimaTrocaOleoData'] = novaManutencao.dataRealizacao;
            if (kmManut) updateFields['manutencaoInfo.ultimaTrocaOleoKm'] = kmManut;
        }
        if (Object.keys(updateFields).length > 0) await db.collection('veiculos').updateOne({ _id: new ObjectId(veiculoId) }, { $set: updateFields });
        res.status(201).json({ message: 'Manutenção registrada!', manutencao: { _id: result.insertedId, ...novaManutencao } });
    } catch (error) { console.error('Erro registrar manutenção:', error); res.status(500).json({ message: 'Erro registrar manutenção.' }); }
});
app.delete('/api/manutencoes/:id', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { id } = req.params; if (!ObjectId.isValid(id)) return res.status(400).json({ message: "ID inválido." });
    try {
        const result = await db.collection('manutencoes').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) return res.status(404).json({ message: "Manutenção não encontrada." });
        res.status(200).json({ message: "Manutenção excluída.", id: id });
    } catch (error) { console.error('Erro excluir manutenção:', error); res.status(500).json({ message: 'Erro excluir manutenção.' }); }
});

// --- ROTAS DA API PARA CHECKLISTS ---
app.get('/api/checklists/historico', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { search } = req.query;
    try {
        const query = {}; if (search) { const sr = new RegExp(search, 'i'); query.$or = [ { veiculoPlaca: sr }, { realizadoPor: sr }, { observacoes: sr } ]; }
        const historico = await db.collection('checklists').find(query).sort({ dataRealizacao: -1 }).toArray();
        res.status(200).json(historico);
    } catch (error) { console.error('Erro histórico checklists:', error); res.status(500).json({ message: 'Erro histórico checklists.' }); }
});
app.post('/api/checklists', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { veiculoId, veiculoPlaca, dataRealizacao, quilometragem, realizadoPor, observacoes } = req.body;
    if (!veiculoId || !veiculoPlaca || !dataRealizacao || !quilometragem) return res.status(400).json({ message: 'Campos obrigatórios.' });
    if (!ObjectId.isValid(veiculoId)) return res.status(400).json({ message: "ID veículo inválido." });
    try {
        const veiculo = await db.collection('veiculos').findOne({ _id: new ObjectId(veiculoId) });
        if (!veiculo) return res.status(404).json({ message: "Veículo não encontrado." });
        const novoChecklist = {
            veiculoId: new ObjectId(veiculoId), veiculoPlaca: veiculoPlaca.toUpperCase().replace(/[^A-Z0-9]/g, ''),
            dataRealizacao: new Date(dataRealizacao), quilometragem: parseInt(quilometragem, 10),
            realizadoPor: realizadoPor ? realizadoPor.trim() : null, observacoes: observacoes ? observacoes.trim() : null,
            dataRegistro: new Date()
        };
        const result = await db.collection('checklists').insertOne(novoChecklist);
        let updateFields = { 'manutencaoInfo.ultimoChecklistData': novoChecklist.dataRealizacao };
        if (novoChecklist.quilometragem > (veiculo.quilometragemAtual || 0)) updateFields.quilometragemAtual = novoChecklist.quilometragem;
        if (veiculo.manutencaoInfo && veiculo.manutencaoInfo.frequenciaChecklistDias) {
            const freq = parseInt(veiculo.manutencaoInfo.frequenciaChecklistDias, 10);
            if (freq > 0) updateFields['manutencaoInfo.dataProxChecklist'] = new Date(new Date(novoChecklist.dataRealizacao).setDate(new Date(novoChecklist.dataRealizacao).getDate() + freq));
        }
        await db.collection('veiculos').updateOne({ _id: new ObjectId(veiculoId) }, { $set: updateFields });
        res.status(201).json({ message: 'Checklist registrado!', checklist: { _id: result.insertedId, ...novoChecklist } });
    } catch (error) { console.error('Erro registrar checklist:', error); res.status(500).json({ message: 'Erro registrar checklist.' }); }
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

// --- ROTAS DA API PARA ABASTECIMENTOS ---
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
        const novoAbastecimento = {
            veiculoId: new ObjectId(veiculoId), veiculoPlaca: veiculo.placa, data: new Date(data),
            quilometragemAtual: pKm, litros: pL, valorPorLitro: pVl, custoTotal: pCt,
            posto: posto ? posto.trim() : null, observacoes: observacoes ? observacoes.trim() : null,
            dataRegistro: new Date()
        };
        const result = await db.collection('abastecimentos').insertOne(novoAbastecimento);
        await db.collection('veiculos').updateOne({ _id: new ObjectId(veiculoId) }, { $set: { quilometragemAtual: pKm } });
        let alertaOleoMsg = null;
        if (veiculo.manutencaoInfo && veiculo.manutencaoInfo.proxTrocaOleoKm && pKm >= veiculo.manutencaoInfo.proxTrocaOleoKm)
            alertaOleoMsg = `Atenção: Troca de óleo recomendada! KM atual (${pKm.toLocaleString('pt-BR')}km) atingiu ou ultrapassou limite (${veiculo.manutencaoInfo.proxTrocaOleoKm.toLocaleString('pt-BR')}km).`;
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


// --- Iniciar o servidor APÓS conectar ao DB ---
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
