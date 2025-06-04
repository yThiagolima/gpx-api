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
            startDate = new Date(year, month, 1);
            endDate = new Date(year, month + 1, 0, 23, 59, 59, 999); // Último dia do mês
        } else {
            startDate = new Date(year, 0, 1); // Início do ano
            endDate = new Date(year, 11, 31, 23, 59, 59, 999); // Fim do ano
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

    if (!username || !email || !password) {
        return res.status(400).json({ message: 'Nome de usuário, email e senha são obrigatórios.' });
    }
    if (username.length < 3) {
        return res.status(400).json({ message: 'Nome de usuário deve ter pelo menos 3 caracteres.' });
    }
    if (password.length < 6) {
        return res.status(400).json({ message: 'A senha deve ter pelo menos 6 caracteres.' });
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
        return res.status(400).json({ message: 'Nome de usuário deve conter apenas letras, números e os caracteres "_", ".", "-".' });
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
        return res.status(400).json({ message: 'Formato de email inválido.' });
    }

    try {
        const usersCollection = db.collection('users');
        const usernameInputLower = username.toLowerCase();
        const emailInputLower = email.toLowerCase();

        const existingUser = await usersCollection.findOne({
            $or: [
                { username: usernameInputLower },
                { email: emailInputLower }
            ]
        });

        if (existingUser) {
            if (existingUser.username === usernameInputLower) {
                return res.status(409).json({ message: 'Este nome de usuário já está em uso.' });
            }
            if (existingUser.email === emailInputLower) {
                return res.status(409).json({ message: 'Este email já está cadastrado.' });
            }
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const newUser = {
            username: username, 
            email: emailInputLower,
            password: hashedPassword,
            createdAt: new Date()
        };
        const result = await usersCollection.insertOne(newUser);

        console.log('Novo usuário registrado:', newUser.username, 'Email:', newUser.email, 'ID:', result.insertedId);
        res.status(201).json({
            message: 'Usuário registrado com sucesso!',
            user: { id: result.insertedId, username: newUser.username, email: newUser.email }
        });

    } catch (error) {
        console.error('Erro ao registrar usuário:', error);
        res.status(500).json({ message: 'Erro interno ao tentar registrar usuário.' });
    }
});

// --- Rota de LOGIN ---
app.post('/login', async (req, res) => {
    if (!db) {
        return res.status(500).json({ message: "Erro interno do servidor: Banco de dados não conectado." });
    }

    const { loginIdentifier, password } = req.body;

    if (!loginIdentifier || !password) {
        return res.status(400).json({ message: 'Identificador de login (usuário/email) e senha são obrigatórios.' });
    }

    try {
        const usersCollection = db.collection('users');
        const loginIdentifierLower = loginIdentifier.toLowerCase();

        const user = await usersCollection.findOne({
            $or: [
                { username: { $regex: new RegExp(`^${loginIdentifierLower}$`, 'i') } }, 
                { email: loginIdentifierLower }
            ]
        });

        if (!user) {
            console.log('Falha no login: Usuário/Email não encontrado para ->', loginIdentifier);
            return res.status(401).json({ message: 'Credenciais inválidas.' });
        }

        const isPasswordMatch = await bcrypt.compare(password, user.password);

        if (!isPasswordMatch) {
            console.log('Falha no login: Senha incorreta para ->', user.username);
            return res.status(401).json({ message: 'Credenciais inválidas.' });
        }

        console.log('Login bem-sucedido para:', user.username);
        res.status(200).json({
            message: 'Login bem-sucedido!',
            user: {
                id: user._id,
                username: user.username, 
                email: user.email
            }
        });

    } catch (error) {
        console.error('Erro durante o login:', error);
        res.status(500).json({ message: 'Erro interno ao tentar fazer login.' });
    }
});

// --- Middleware de Autenticação Placeholder ---
const simpleAuthCheck = (req, res, next) => {
    next();
};

// --- ROTAS DA API PARA A DASHBOARD ---
app.get('/api/dashboard/stats', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    try {
        const totalVeiculos = await db.collection('veiculos').countDocuments();
        
        const proximasManutencoesData = await db.collection('veiculos').countDocuments({
            $or: [
                { 'manutencaoInfo.proxTrocaOleoData': { $gte: new Date() } },
                { 'manutencaoInfo.dataProxChecklist': { $gte: new Date() } }
            ]
        });
        
        const veiculosComProxTrocaKm = await db.collection('veiculos').find({
            'manutencaoInfo.proxTrocaOleoKm': { $exists: true, $ne: null }
        }).toArray();

        let alertasKmOleo = 0;
        veiculosComProxTrocaKm.forEach(v => {
            if (v.quilometragemAtual >= v.manutencaoInfo.proxTrocaOleoKm) {
                alertasKmOleo++;
            }
        });

        const stats = {
            totalVeiculos: totalVeiculos,
            alertasAtivos: proximasManutencoesData + alertasKmOleo, 
            manutencoesAgendadas: proximasManutencoesData 
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
        const manutencoes = db.collection('manutencoes').find().sort({ dataRealizacao: -1 }).limit(5).project({ _id: 1, veiculoPlaca: 1, tipoManutencao: 1, dataRealizacao: 1 }).toArray();
        const checklists = db.collection('checklists').find().sort({ dataRealizacao: -1 }).limit(5).project({ _id: 1, veiculoPlaca: 1, realizadoPor: 1, dataRealizacao: 1 }).toArray();
        const abastecimentos = db.collection('abastecimentos').find().sort({ data: -1 }).limit(5).project({ _id: 1, veiculoPlaca: 1, litros: 1, data: 1 }).toArray();
        
        const [manutencoesRecentes, checklistsRecentes, abastecimentosRecentes] = await Promise.all([manutencoes, checklists, abastecimentos]);
        
        let activities = [];
        manutencoesRecentes.forEach(m => activities.push({
            id: m._id, tipo: 'manutencao',
            descricao: `Manutenção (${m.tipoManutencao || 'Geral'}) ${m.veiculoPlaca || ''}`, data: m.dataRealizacao
        }));
        checklistsRecentes.forEach(c => activities.push({
            id: c._id, tipo: 'checklist',
            descricao: `Checklist ${c.veiculoPlaca || ''} por ${c.realizadoPor || 'N/A'}`, data: c.dataRealizacao
        }));
        abastecimentosRecentes.forEach(a => activities.push({
            id: a._id, tipo: 'abastecimento',
            descricao: `Abastecimento ${a.veiculoPlaca || ''} (${a.litros.toFixed(1)}L)`, data: a.data
        }));

        activities.sort((a, b) => new Date(b.data) - new Date(a.data));
        res.json(activities.slice(0, 5)); // Pega as 5 mais recentes no geral

    } catch (error) {
        console.error("Erro em /api/dashboard/recent-activity:", error);
        res.status(500).json({ message: "Erro ao buscar atividades."});
    }
});

// --- ROTAS DA API PARA VEÍCULOS ---
app.get('/api/veiculos', simpleAuthCheck, async (req, res) => {
    if (!db) {
        return res.status(500).json({ message: "Erro interno do servidor: Banco de dados não conectado." });
    }
    try {
        const veiculosCollection = db.collection('veiculos');
        const veiculos = await veiculosCollection.find({}).sort({ dataCadastro: -1 }).toArray();
        res.status(200).json(veiculos);
    } catch (error) {
        console.error('Erro ao buscar veículos:', error);
        res.status(500).json({ message: 'Erro interno ao tentar buscar veículos.' });
    }
});

app.post('/api/veiculos', simpleAuthCheck, async (req, res) => {
    if (!db) {
        return res.status(500).json({ message: "Erro interno do servidor: Banco de dados não conectado." });
    }
    const d = req.body; // Shorthand for req.body
    const p = (v, t) => (v !== undefined && v !== null && v !== '') ? (t === 'int' ? parseInt(v,10) : (t === 'date' ? new Date(v) : v)) : null;

    const novoVeiculo = {
        placa: (d.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
        marca: (d.marca||'').trim(),
        modelo: (d.modelo||'').trim(),
        anoFabricacao: p(d.anoFabricacao, 'int'),
        anoModelo: p(d.anoModelo, 'int'),
        cor: d.cor ? d.cor.trim() : null,
        chassi: d.chassi ? d.chassi.trim() : null,
        renavam: d.renavam ? d.renavam.trim() : null,
        quilometragemAtual: p(d.quilometragemAtual, 'int'),
        manutencaoInfo: {
            proxTrocaOleoKm: p(d.oleoKm, 'int'),
            proxTrocaOleoData: p(d.oleoData, 'date'),
            frequenciaChecklistDias: p(d.frequenciaChecklist, 'int'),
            dataProxChecklist: (d.frequenciaChecklist && parseInt(d.frequenciaChecklist,10) > 0) ? new Date(new Date().setDate(new Date().getDate() + parseInt(d.frequenciaChecklist,10))) : null,
            ultimaTrocaOleoKm: null, 
            ultimaTrocaOleoData: null, 
            ultimoChecklistData: null 
        },
        dataCadastro: new Date(),
    };

    if (!novoVeiculo.placa || !novoVeiculo.marca || !novoVeiculo.modelo || novoVeiculo.anoFabricacao === null || novoVeiculo.anoModelo === null || novoVeiculo.quilometragemAtual === null) {
        return res.status(400).json({
            message: "Campos obrigatórios não preenchidos: Placa, Marca, Modelo, Ano Fabricação, Ano Modelo, Quilometragem Atual."
        });
    }

    try {
        const veiculosCollection = db.collection('veiculos');
        const existingVeiculo = await veiculosCollection.findOne({ placa: novoVeiculo.placa });
        if (existingVeiculo) {
            return res.status(409).json({ message: `Veículo com a placa ${novoVeiculo.placa} já cadastrado.` });
        }
        const result = await veiculosCollection.insertOne(novoVeiculo);
        res.status(201).json({
            message: 'Veículo cadastrado com sucesso!',
            veiculo: { _id: result.insertedId, ...novoVeiculo }
        });
    } catch (error) {
        console.error('Erro ao cadastrar veículo:', error);
        res.status(500).json({ message: 'Erro interno ao tentar cadastrar veículo.' });
    }
});

app.delete('/api/veiculos/:id', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "ID inválido." });
    try {
        const result = await db.collection('veiculos').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) return res.status(404).json({ message: "Veículo não encontrado." });
        // Adicional: Excluir manutenções, checklists e abastecimentos associados a este veículo
        await db.collection('manutencoes').deleteMany({ veiculoId: new ObjectId(id) });
        await db.collection('checklists').deleteMany({ veiculoId: new ObjectId(id) });
        await db.collection('abastecimentos').deleteMany({ veiculoId: new ObjectId(id) });
        res.status(200).json({ message: "Veículo e seus registros associados foram excluídos." });
    } catch (error) {
        console.error('Erro ao excluir veículo:', error);
        res.status(500).json({ message: 'Erro ao excluir veículo.' });
    }
});

app.get('/api/veiculos/:id', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "ID inválido." });
    try {
        const veiculo = await db.collection('veiculos').findOne({ _id: new ObjectId(id) });
        if (!veiculo) return res.status(404).json({ message: "Veículo não encontrado." });
        res.status(200).json(veiculo);
    } catch (error) {
        console.error('Erro ao buscar veículo:', error);
        res.status(500).json({ message: 'Erro ao buscar veículo.' });
    }
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
    // Campos diretos do veículo
    if (d.placa !== undefined) updatedFields.placa = d.placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (d.marca !== undefined) updatedFields.marca = d.marca.trim();
    if (d.modelo !== undefined) updatedFields.modelo = d.modelo.trim();
    if (d.anoFabricacao !== undefined) updatedFields.anoFabricacao = p(d.anoFabricacao, 'int');
    if (d.anoModelo !== undefined) updatedFields.anoModelo = p(d.anoModelo, 'int');
    if (d.cor !== undefined) updatedFields.cor = d.cor ? d.cor.trim() : null;
    if (d.chassi !== undefined) updatedFields.chassi = d.chassi ? d.chassi.trim() : null;
    if (d.renavam !== undefined) updatedFields.renavam = d.renavam ? d.renavam.trim() : null;
    if (d.quilometragemAtual !== undefined) updatedFields.quilometragemAtual = p(d.quilometragemAtual, 'int');
    
    // Campos dentro de manutencaoInfo
    if (d.oleoKm !== undefined) updatedFields['manutencaoInfo.proxTrocaOleoKm'] = p(d.oleoKm, 'int');
    else if (d.oleoKm === null) updatedFields['manutencaoInfo.proxTrocaOleoKm'] = null;

    if (d.oleoData !== undefined) updatedFields['manutencaoInfo.proxTrocaOleoData'] = p(d.oleoData, 'date');
    else if (d.oleoData === null) updatedFields['manutencaoInfo.proxTrocaOleoData'] = null;

    if (d.frequenciaChecklist !== undefined) {
        const freq = p(d.frequenciaChecklist, 'int');
        updatedFields['manutencaoInfo.frequenciaChecklistDias'] = freq;
        if (freq && freq > 0) {
            const baseDate = veiculoAtual.manutencaoInfo.ultimoChecklistData || new Date(); // Usa a data do último checklist ou hoje
            updatedFields['manutencaoInfo.dataProxChecklist'] = new Date(new Date(baseDate).setDate(new Date(baseDate).getDate() + freq));
        } else {
            updatedFields['manutencaoInfo.dataProxChecklist'] = null; // Limpa se frequência for 0 ou nula
        }
    } else if (d.frequenciaChecklist === null) {
         updatedFields['manutencaoInfo.frequenciaChecklistDias'] = null;
         updatedFields['manutencaoInfo.dataProxChecklist'] = null;
    }
    
    // Validação de campos obrigatórios após construção do update (apenas se foram enviados para update)
    if ((updatedFields.placa !== undefined && !updatedFields.placa) ||
        (updatedFields.marca !== undefined && !updatedFields.marca) ||
        (updatedFields.modelo !== undefined && !updatedFields.modelo) ||
        (updatedFields.anoFabricacao !== undefined && updatedFields.anoFabricacao === null) ||
        (updatedFields.anoModelo !== undefined && updatedFields.anoModelo === null) ||
        (updatedFields.quilometragemAtual !== undefined && updatedFields.quilometragemAtual === null)
    ) {
         return res.status(400).json({ message: "Campos obrigatórios (Placa, Marca, Modelo, Ano Fab/Mod, KM Atual) não podem ser vazios se fornecidos para atualização." });
    }

    try {
        if (updatedFields.placa && updatedFields.placa !== veiculoAtual.placa) {
            const existingVeiculoWithSamePlaca = await db.collection('veiculos').findOne({ placa: updatedFields.placa, _id: { $ne: new ObjectId(id) } });
            if (existingVeiculoWithSamePlaca) {
                return res.status(409).json({ message: `Placa ${updatedFields.placa} já está em uso por outro veículo.` });
            }
        }
        const result = await db.collection('veiculos').updateOne({ _id: new ObjectId(id) }, { $set: updatedFields });
        if (result.matchedCount === 0) return res.status(404).json({ message: "Veículo não encontrado para atualização." });
        res.status(200).json({ message: "Veículo atualizado com sucesso." });
    } catch (error) {
        console.error('Erro ao atualizar veículo:', error);
        res.status(500).json({ message: 'Erro interno ao tentar atualizar veículo.' });
    }
});

// --- ROTAS DA API PARA MANUTENÇÕES ---
app.get('/api/manutencoes/proximas', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    try {
        const veiculos = await db.collection('veiculos').find({}).toArray();
        const hoje = new Date();
        hoje.setHours(0,0,0,0);
        const proximas = [];

        veiculos.forEach(v => {
            if (v.manutencaoInfo) {
                // Alerta Troca de Óleo por Data
                if (v.manutencaoInfo.proxTrocaOleoData) {
                    const dataOleo = new Date(v.manutencaoInfo.proxTrocaOleoData);
                    dataOleo.setHours(0,0,0,0); // Normaliza para comparar apenas a data
                    if (dataOleo >= hoje) {
                        proximas.push({
                            _id: v._id.toString() + '_oleoData', veiculoId: v._id.toString(), veiculoPlaca: v.placa,
                            tipo: 'Troca de Óleo',
                            descricao: `Troca de óleo programada para ${dataOleo.toLocaleDateString('pt-BR')}.`,
                            dataPrevista: dataOleo, kmPrevisto: v.manutencaoInfo.proxTrocaOleoKm
                        });
                    }
                }
                // Alerta Troca de Óleo por KM
                if (v.manutencaoInfo.proxTrocaOleoKm && v.quilometragemAtual >= v.manutencaoInfo.proxTrocaOleoKm) {
                     const jaExisteAlertaOleoPorDataValida = proximas.some(p => 
                        p.veiculoId === v._id.toString() && 
                        p.tipo === 'Troca de Óleo' && 
                        p.dataPrevista && new Date(p.dataPrevista) >= hoje
                     );
                    if (!jaExisteAlertaOleoPorDataValida) {
                        proximas.push({
                            _id: v._id.toString() + '_oleoKm', veiculoId: v._id.toString(), veiculoPlaca: v.placa,
                            tipo: 'Troca de Óleo',
                            descricao: `ALERTA: Troca de óleo por KM (${v.quilometragemAtual.toLocaleString('pt-BR')} de ${v.manutencaoInfo.proxTrocaOleoKm.toLocaleString('pt-BR')}km).`,
                            dataPrevista: null, 
                            kmPrevisto: v.manutencaoInfo.proxTrocaOleoKm,
                            kmAtual: v.quilometragemAtual,
                            alertaKm: true
                        });
                    }
                }
                // Alerta Próximo Checklist
                if (v.manutencaoInfo.dataProxChecklist) {
                    const dataCheck = new Date(v.manutencaoInfo.dataProxChecklist);
                    dataCheck.setHours(0,0,0,0); // Normaliza
                    if (dataCheck >= hoje) {
                        proximas.push({
                            _id: v._id.toString() + '_checklist', veiculoId: v._id.toString(), veiculoPlaca: v.placa,
                            tipo: 'Checklist',
                            descricao: `Checklist periódico para ${dataCheck.toLocaleDateString('pt-BR')}. Frequência: ${v.manutencaoInfo.frequenciaChecklistDias || 'N/A'} dias.`,
                            dataPrevista: dataCheck
                        });
                    }
                }
            }
        });
        proximas.sort((a, b) => {
            const dateA = a.dataPrevista ? new Date(a.dataPrevista) : (a.alertaKm ? new Date(0) : new Date(8640000000000000)); 
            const dateB = b.dataPrevista ? new Date(b.dataPrevista) : (b.alertaKm ? new Date(0) : new Date(8640000000000000));
            return dateA.getTime() - dateB.getTime();
        });
        res.status(200).json(proximas);
    } catch (error) {
        console.error('Erro ao buscar próximas manutenções:', error);
        res.status(500).json({ message: 'Erro ao buscar próximas manutenções.' });
    }
});

app.get('/api/manutencoes/historico', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { search } = req.query;
    try {
        const query = {};
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { veiculoPlaca: searchRegex }, { tipoManutencao: searchRegex }, { descricao: searchRegex }
            ];
        }
        const historico = await db.collection('manutencoes').find(query).sort({ dataRealizacao: -1, dataRegistro: -1 }).toArray();
        res.status(200).json(historico);
    } catch (error) {
        console.error('Erro ao buscar histórico de manutenções:', error);
        res.status(500).json({ message: 'Erro ao buscar histórico.' });
    }
});

app.post('/api/manutencoes', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { veiculoId, veiculoPlaca, tipoManutencao, dataRealizacao, custo, descricao, quilometragem, realizadaPor } = req.body;
    if (!veiculoId || !veiculoPlaca || !tipoManutencao || !dataRealizacao) {
        return res.status(400).json({ message: 'Campos obrigatórios: veiculoId, veiculoPlaca, tipoManutencao e dataRealizacao.' });
    }
    if (!ObjectId.isValid(veiculoId)) return res.status(400).json({ message: "ID do veículo inválido." });

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

        let updateVeiculoFields = {};
        const kmManutencao = novaManutencao.quilometragem;

        if (kmManutencao && kmManutencao > (veiculo.quilometragemAtual || 0) ) { // Apenas atualiza se for maior
             updateVeiculoFields.quilometragemAtual = kmManutencao;
        }

        if (tipoManutencao.toLowerCase().includes('óleo') || tipoManutencao.toLowerCase().includes('oleo')) {
            updateVeiculoFields['manutencaoInfo.ultimaTrocaOleoData'] = novaManutencao.dataRealizacao;
            if (kmManutencao) {
                updateVeiculoFields['manutencaoInfo.ultimaTrocaOleoKm'] = kmManutencao;
            }
            // O usuário deve redefinir a 'proxTrocaOleoKm' e 'proxTrocaOleoData' na edição do veículo
            // ou ter um sistema de cálculo de próxima manutenção mais robusto.
        }
        
        if (Object.keys(updateVeiculoFields).length > 0) {
            await db.collection('veiculos').updateOne({ _id: new ObjectId(veiculoId) }, { $set: updateVeiculoFields });
        }

        res.status(201).json({ message: 'Manutenção registrada com sucesso!', manutencao: { _id: result.insertedId, ...novaManutencao } });
    } catch (error) {
        console.error('Erro ao registrar manutenção:', error);
        res.status(500).json({ message: 'Erro interno ao tentar registrar manutenção.' });
    }
});

app.delete('/api/manutencoes/:id', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "ID de manutenção inválido." });
    try {
        const result = await db.collection('manutencoes').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) return res.status(404).json({ message: "Manutenção não encontrada para exclusão." });
        res.status(200).json({ message: "Manutenção excluída com sucesso.", id: id });
    } catch (error) {
        console.error('Erro ao excluir manutenção:', error);
        res.status(500).json({ message: 'Erro interno ao tentar excluir manutenção.' });
    }
});

// --- ROTAS DA API PARA CHECKLISTS ---
app.get('/api/checklists/historico', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { search } = req.query;
    try {
        const query = {};
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { veiculoPlaca: searchRegex }, { realizadoPor: searchRegex }, { observacoes: searchRegex }
            ];
        }
        const historico = await db.collection('checklists').find(query).sort({ dataRealizacao: -1 }).toArray();
        res.status(200).json(historico);
    } catch (error) {
        console.error('Erro ao buscar histórico de checklists:', error);
        res.status(500).json({ message: 'Erro ao buscar histórico de checklists.' });
    }
});

app.post('/api/checklists', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { veiculoId, veiculoPlaca, dataRealizacao, quilometragem, realizadoPor, observacoes } = req.body;

    if (!veiculoId || !veiculoPlaca || !dataRealizacao || !quilometragem) {
        return res.status(400).json({ message: 'Campos obrigatórios (veiculo, data, km) não preenchidos.' });
    }
    if (!ObjectId.isValid(veiculoId)) return res.status(400).json({ message: "ID do veículo inválido." });

    try {
        const veiculo = await db.collection('veiculos').findOne({ _id: new ObjectId(veiculoId) });
        if (!veiculo) return res.status(404).json({ message: "Veículo não encontrado." });

        const novoChecklist = {
            veiculoId: new ObjectId(veiculoId),
            veiculoPlaca: veiculoPlaca.toUpperCase().replace(/[^A-Z0-9]/g, ''),
            dataRealizacao: new Date(dataRealizacao),
            quilometragem: parseInt(quilometragem, 10),
            realizadoPor: realizadoPor ? realizadoPor.trim() : null,
            observacoes: observacoes ? observacoes.trim() : null,
            dataRegistro: new Date()
        };
        const result = await db.collection('checklists').insertOne(novoChecklist);

        let updateVeiculoFields = {
            'manutencaoInfo.ultimoChecklistData': novoChecklist.dataRealizacao
        };
        if (novoChecklist.quilometragem > (veiculo.quilometragemAtual || 0)) { // Apenas atualiza se for maior
            updateVeiculoFields.quilometragemAtual = novoChecklist.quilometragem;
        }
        if (veiculo.manutencaoInfo && veiculo.manutencaoInfo.frequenciaChecklistDias) {
            const freqDias = parseInt(veiculo.manutencaoInfo.frequenciaChecklistDias, 10);
            if (freqDias > 0) {
                updateVeiculoFields['manutencaoInfo.dataProxChecklist'] = new Date(new Date(novoChecklist.dataRealizacao).setDate(new Date(novoChecklist.dataRealizacao).getDate() + freqDias));
            }
        }
        await db.collection('veiculos').updateOne({ _id: new ObjectId(veiculoId) }, { $set: updateVeiculoFields });

        res.status(201).json({ message: 'Checklist registrado com sucesso!', checklist: { _id: result.insertedId, ...novoChecklist } });
    } catch (error) {
        console.error('Erro ao registrar checklist:', error);
        res.status(500).json({ message: 'Erro interno ao tentar registrar checklist.' });
    }
});

app.delete('/api/checklists/:id', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "ID inválido." });
    try {
        const result = await db.collection('checklists').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) return res.status(404).json({ message: "Checklist não encontrado." });
        res.status(200).json({ message: "Checklist excluído com sucesso." });
    } catch (error) {
        console.error('Erro ao excluir checklist:', error);
        res.status(500).json({ message: 'Erro ao excluir checklist.' });
    }
});

// --- ROTAS DA API PARA ABASTECIMENTOS ---
app.post('/api/abastecimentos', simpleAuthCheck, async (req, res) => {
    if (!db) {
        return res.status(500).json({ message: "Erro interno do servidor: Banco de dados não conectado." });
    }

    const { veiculoId, data, quilometragemAtual, litros, valorPorLitro, custoTotal, posto, observacoes } = req.body;

    if (!veiculoId || !data || !quilometragemAtual || !litros || !valorPorLitro) {
        return res.status(400).json({ message: "Campos obrigatórios: Veículo, Data, Quilometragem, Litros e Valor por Litro." });
    }
    if (!ObjectId.isValid(veiculoId)) {
        return res.status(400).json({ message: "ID do veículo inválido." });
    }

    const parsedQuilometragem = parseInt(quilometragemAtual, 10);
    const parsedLitros = parseFloat(litros);
    const parsedValorPorLitro = parseFloat(valorPorLitro);
    let parsedCustoTotal = custoTotal ? parseFloat(custoTotal) : (parsedLitros * parsedValorPorLitro);

    if (isNaN(parsedQuilometragem) || parsedQuilometragem < 0 ||
        isNaN(parsedLitros) || parsedLitros <= 0 ||
        isNaN(parsedValorPorLitro) || parsedValorPorLitro <= 0 ||
        isNaN(parsedCustoTotal) || parsedCustoTotal < 0) { 
        return res.status(400).json({ message: "Valores numéricos inválidos para abastecimento." });
    }

    try {
        const veiculosCollection = db.collection('veiculos');
        const abastecimentosCollection = db.collection('abastecimentos');

        const veiculo = await veiculosCollection.findOne({ _id: new ObjectId(veiculoId) });
        if (!veiculo) {
            return res.status(404).json({ message: "Veículo não encontrado." });
        }
        if (parsedQuilometragem < (veiculo.quilometragemAtual || 0) ) {
            return res.status(400).json({ message: `Quilometragem informada (${parsedQuilometragem.toLocaleString('pt-BR')}km) é menor que a última registrada para o veículo (${(veiculo.quilometragemAtual || 0).toLocaleString('pt-BR')}km).` });
        }

        const novoAbastecimento = {
            veiculoId: new ObjectId(veiculoId),
            veiculoPlaca: veiculo.placa, 
            data: new Date(data),
            quilometragemAtual: parsedQuilometragem,
            litros: parsedLitros,
            valorPorLitro: parsedValorPorLitro,
            custoTotal: parsedCustoTotal,
            posto: posto ? posto.trim() : null,
            observacoes: observacoes ? observacoes.trim() : null,
            dataRegistro: new Date()
        };
        const resultAbastecimento = await abastecimentosCollection.insertOne(novoAbastecimento);

        await veiculosCollection.updateOne(
            { _id: new ObjectId(veiculoId) },
            { $set: { quilometragemAtual: parsedQuilometragem } }
        );

        let alertaOleoMsg = null;
        if (veiculo.manutencaoInfo && veiculo.manutencaoInfo.proxTrocaOleoKm) {
            if (parsedQuilometragem >= veiculo.manutencaoInfo.proxTrocaOleoKm) {
                alertaOleoMsg = `Atenção: Troca de óleo recomendada! KM atual (${parsedQuilometragem.toLocaleString('pt-BR')}km) atingiu ou ultrapassou o limite para troca (${veiculo.manutencaoInfo.proxTrocaOleoKm.toLocaleString('pt-BR')}km).`;
            }
        }

        res.status(201).json({
            message: 'Abastecimento registrado com sucesso!',
            abastecimento: { _id: resultAbastecimento.insertedId, ...novoAbastecimento },
            alertaOleo: alertaOleoMsg 
        });

    } catch (error) {
        console.error('Erro ao registrar abastecimento:', error);
        res.status(500).json({ message: 'Erro interno ao tentar registrar abastecimento.' });
    }
});


// --- ROTAS DA API PARA RELATÓRIOS ---

// 1. Gastos Detalhados (Manutenções e Abastecimentos)
app.get('/api/relatorios/gastos-detalhados', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { veiculoId, mes, ano } = req.query;

    try {
        let queryManutencoes = {};
        let queryAbastecimentos = {};

        if (veiculoId && veiculoId !== 'todos') {
            if (!ObjectId.isValid(veiculoId)) return res.status(400).json({ message: "ID de veículo inválido." });
            queryManutencoes.veiculoId = new ObjectId(veiculoId);
            queryAbastecimentos.veiculoId = new ObjectId(veiculoId);
        }

        const dateFilterManutencao = getDateQuery(mes, ano);
        if (dateFilterManutencao.dateMatch) {
            queryManutencoes.dataRealizacao = dateFilterManutencao.dateMatch;
        }
        const dateFilterAbastecimento = getDateQuery(mes, ano);
        if (dateFilterAbastecimento.dateMatch) {
            queryAbastecimentos.data = dateFilterAbastecimento.dateMatch; // Nome do campo de data em abastecimentos
        }

        const manutencoes = await db.collection('manutencoes').find(queryManutencoes).toArray();
        const abastecimentos = await db.collection('abastecimentos').find(queryAbastecimentos).toArray();

        let gastosCombinados = [];
        let totalGeral = 0;

        manutencoes.forEach(m => {
            if (m.custo && m.custo > 0) {
                gastosCombinados.push({
                    _id: m._id,
                    data: m.dataRealizacao,
                    veiculoId: m.veiculoId,
                    veiculoPlaca: m.veiculoPlaca,
                    tipoGasto: "Manutenção",
                    descricaoGasto: m.tipoManutencao || m.descricao || "Manutenção geral",
                    valorGasto: parseFloat(m.custo.toFixed(2))
                });
                totalGeral += m.custo;
            }
        });

        abastecimentos.forEach(a => {
            if (a.custoTotal && a.custoTotal > 0) {
                gastosCombinados.push({
                    _id: a._id,
                    data: a.data,
                    veiculoId: a.veiculoId,
                    veiculoPlaca: a.veiculoPlaca,
                    tipoGasto: "Combustível",
                    descricaoGasto: `Abastecimento ${a.litros.toFixed(2)}L (${a.posto || 'N/I'})`,
                    valorGasto: parseFloat(a.custoTotal.toFixed(2))
                });
                totalGeral += a.custoTotal;
            }
        });

        gastosCombinados.sort((x, y) => new Date(y.data) - new Date(x.data)); 

        res.status(200).json({
            detalhes: gastosCombinados,
            sumario: {
                totalGastos: parseFloat(totalGeral.toFixed(2))
            }
        });

    } catch (error) {
        console.error("Erro ao buscar gastos detalhados:", error);
        res.status(500).json({ message: "Erro interno ao buscar gastos detalhados." });
    }
});


// 2. Dados para Gráficos de Gastos Mensais
app.get('/api/relatorios/gastos-mensais', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { veiculoId, ano } = req.query;

    const targetAno = (ano && ano !== 'todos') ? parseInt(ano) : new Date().getFullYear();

    try {
        let matchAbastecimento = { 
            data: { 
                $gte: new Date(targetAno, 0, 1),
                $lt: new Date(targetAno + 1, 0, 1)
            },
            custoTotal: { $gt: 0}
        };
        let matchManutencao = {
            dataRealizacao: {
                $gte: new Date(targetAno, 0, 1),
                $lt: new Date(targetAno + 1, 0, 1)
            },
            custo: { $gt: 0 }
        };

        if (veiculoId && veiculoId !== 'todos') {
            if (!ObjectId.isValid(veiculoId)) return res.status(400).json({ message: "ID de veículo inválido." });
            matchAbastecimento.veiculoId = new ObjectId(veiculoId);
            matchManutencao.veiculoId = new ObjectId(veiculoId);
        }
        
        const groupStageAbastecimentos = {
            $group: {
                _id: { mes: { $month: "$data" } }, 
                totalCombustivel: { $sum: "$custoTotal" }
            }
        };
        const groupStageManutencoes = {
            $group: {
                _id: { mes: { $month: "$dataRealizacao" } },
                totalManutencao: { $sum: "$custo" }
            }
        };
        
        const sortStage = { $sort: { "_id.mes": 1 } }; 

        const gastosCombustivel = await db.collection('abastecimentos').aggregate([ { $match: matchAbastecimento } , groupStageAbastecimentos, sortStage]).toArray();
        const gastosManutencao = await db.collection('manutencoes').aggregate([ { $match: matchManutencao }, groupStageManutencoes, sortStage]).toArray();
        
        const mesesNomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
        let dataCombustivel = Array(12).fill(0);
        let dataManutencao = Array(12).fill(0);

        gastosCombustivel.forEach(item => {
            dataCombustivel[item._id.mes - 1] = parseFloat(item.totalCombustivel.toFixed(2));
        });
        gastosManutencao.forEach(item => {
            dataManutencao[item._id.mes - 1] = parseFloat(item.totalManutencao.toFixed(2));
        });
        
        let datasets = [
            { label: 'Gastos com Combustível', data: dataCombustivel, backgroundColor: 'rgba(255, 159, 64, 0.5)', borderColor: 'rgba(255, 159, 64, 1)', borderWidth: 1 },
            { label: 'Gastos com Manutenção', data: dataManutencao, backgroundColor: 'rgba(75, 192, 192, 0.5)', borderColor: 'rgba(75, 192, 192, 1)', borderWidth: 1 }
        ];

        res.status(200).json({ labels: mesesNomes, datasets });

    } catch (error) {
        console.error("Erro ao buscar dados para gráfico de gastos mensais:", error);
        res.status(500).json({ message: "Erro interno ao buscar dados para gráfico." });
    }
});

// 3. Análise de Combustível
app.get('/api/relatorios/analise-combustivel', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { veiculoId, mes, ano } = req.query;

    try {
        let queryAbastecimentos = {};
        if (veiculoId && veiculoId !== 'todos') {
            if (!ObjectId.isValid(veiculoId)) return res.status(400).json({ message: "ID de veículo inválido." });
            queryAbastecimentos.veiculoId = new ObjectId(veiculoId);
        }
        const dateFilter = getDateQuery(mes, ano);
        if (dateFilter.dateMatch) {
            queryAbastecimentos.data = dateFilter.dateMatch;
        }

        const abastecimentos = await db.collection('abastecimentos')
            .find(queryAbastecimentos)
            .sort({ veiculoId: 1, data: 1, quilometragemAtual: 1 })
            .toArray();
        
        let detalhesFormatados = [];
        let sumario = {
            totalGastoCombustivel: 0,
            totalLitros: 0,
            totalKmRodados: 0,
        };

        let ultimoKmPorVeiculo = {};

        for (const a of abastecimentos) {
            sumario.totalGastoCombustivel += a.custoTotal;
            sumario.totalLitros += a.litros;

            const vIdStr = a.veiculoId.toString();
            let kmRodados = null;
            let consumoNoTrecho = null;

            if (ultimoKmPorVeiculo[vIdStr] !== undefined && a.quilometragemAtual > ultimoKmPorVeiculo[vIdStr]) {
                kmRodados = a.quilometragemAtual - ultimoKmPorVeiculo[vIdStr];
                sumario.totalKmRodados += kmRodados;
                if (a.litros > 0) { 
                    consumoNoTrecho = parseFloat((kmRodados / a.litros).toFixed(2));
                }
            }
            
            detalhesFormatados.push({
                ...a,
                kmRodados: kmRodados,
                consumoNoTrecho: consumoNoTrecho
            });
            ultimoKmPorVeiculo[vIdStr] = a.quilometragemAtual;
        }
        
        sumario.totalGastoCombustivel = parseFloat(sumario.totalGastoCombustivel.toFixed(2));
        sumario.totalLitros = parseFloat(sumario.totalLitros.toFixed(2));
        sumario.totalKmRodados = parseFloat(sumario.totalKmRodados.toFixed(2));
        sumario.consumoMedioGeral = sumario.totalLitros > 0 ? parseFloat((sumario.totalKmRodados / sumario.totalLitros).toFixed(2)) : 0;
        sumario.custoMedioPorKm = sumario.totalKmRodados > 0 ? parseFloat((sumario.totalGastoCombustivel / sumario.totalKmRodados).toFixed(2)) : 0;
        sumario.precoMedioLitro = sumario.totalLitros > 0 ? parseFloat((sumario.totalGastoCombustivel / sumario.totalLitros).toFixed(3)) : 0;

        res.status(200).json({
            detalhes: detalhesFormatados.sort((x,y) => new Date(y.data) - new Date(x.data)),
            sumario
        });

    } catch (error) {
        console.error("Erro ao buscar análise de combustível:", error);
        res.status(500).json({ message: "Erro interno ao buscar análise de combustível." });
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
