// Importa o Modelo de Cliente que criamos para que possamos usá-lo para interagir com o banco
const Customer = require('../models/Customer');

// --- Função para CRIAR um novo cliente ---
// Esta função será executada quando recebermos uma requisição POST
exports.createCustomer = async (req, res) => {
    try {
        // Usa o modelo 'Customer' para criar um novo documento no banco de dados
        // com os dados que vieram no corpo (body) da requisição
        const newCustomer = await Customer.create(req.body);

        // Se deu tudo certo, responde com o status 201 (Created) e os dados do cliente criado
        res.status(201).json({
            status: 'success',
            data: {
                customer: newCustomer
            }
        });
    } catch (err) {
        // Se ocorrer um erro (ex: campo obrigatório faltando), responde com status 400 (Bad Request)
        res.status(400).json({
            status: 'fail',
            message: "Erro ao cadastrar cliente: " + err.message
        });
    }
};

// --- Função para LISTAR todos os clientes ---
// Esta função será executada quando recebermos uma requisição GET
exports.getAllCustomers = async (req, res) => {
    try {
        // Usa o modelo 'Customer' para buscar (.find()) todos os documentos no banco
        const customers = await Customer.find();

        // Responde com o status 200 (OK), o número de resultados e a lista de clientes
        res.status(200).json({
            status: 'success',
            results: customers.length,
            data: {
                customers
            }
        });
    } catch (err) {
        // Se ocorrer um erro, responde com status 404 (Not Found)
        res.status(404).json({
            status: 'fail',
            message: err.message
        });
    }
};
