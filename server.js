require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const path = require("path");
const { MercadoPagoConfig, Payment } = require("mercadopago");

const app = express();
const PORT = process.env.PORT || 3000;

const client = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN
});

const payment = new Payment(client);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));


/* =========================================================
   STATUS DO SERVIDOR
========================================================= */

app.get("/api/status", (req, res) => {
    res.json({
        sucesso: true,
        mensagem: "Servidor conectado e pronto para o Mercado Pago."
    });
});


/* =========================================================
   PAGAMENTO PIX DE TESTE
========================================================= */

app.post("/api/criar-pagamento-teste", async (req, res) => {
    try {
        const pagamento = await payment.create({
            body: {
                transaction_amount: 10,
                description: "Teste - Apadrinhe um Desbravador",
                payment_method_id: "pix",
                payer: {
                    email: "test_payer_123@testuser.com"
                }
            },
            requestOptions: {
                idempotencyKey: crypto.randomUUID()
            }
        });

        res.json({
            sucesso: true,
            pagamento: pagamento
        });

    } catch (erro) {
        console.error("Erro ao criar pagamento de teste:", erro);

        res.status(500).json({
            sucesso: false,
            erro: erro.message || "Erro ao criar pagamento"
        });
    }
});


/* =========================================================
   NOVO ENDPOINT - CRIAR PIX
========================================================= */

app.post("/api/criar-pix", async (req, res) => {
    try {

        const {
            transaction_amount,
            nome,
            email
        } = req.body;

        const valor = Number(transaction_amount);

        const valoresPermitidos = [
            50,
            100,
            200,
            500,
            1000,
            2000
        ];

        /* ---------------------------------------------
           VALIDAÇÃO DO VALOR
        --------------------------------------------- */

        if (!Number.isFinite(valor) || valor <= 0) {
            return res.status(400).json({
                sucesso: false,
                erro: "Valor de pagamento inválido."
            });
        }

        if (!valoresPermitidos.includes(valor)) {
            return res.status(400).json({
                sucesso: false,
                erro: "Este valor não está disponível para apadrinhamento."
            });
        }


        /* ---------------------------------------------
           VALIDAÇÃO DO NOME
        --------------------------------------------- */

        if (!nome || nome.trim().length < 2) {
            return res.status(400).json({
                sucesso: false,
                erro: "Informe seu nome."
            });
        }


        /* ---------------------------------------------
           VALIDAÇÃO DO E-MAIL
        --------------------------------------------- */

        if (!email || !email.includes("@")) {
            return res.status(400).json({
                sucesso: false,
                erro: "Informe um e-mail válido."
            });
        }


        /* ---------------------------------------------
           CRIAÇÃO DO PIX
        --------------------------------------------- */

        const descricaoPagamento =
            "Apadrinhe um Desbravador - Campori Barretos 2027";

        const resultado = await payment.create({

            body: {
                transaction_amount: valor,

                description: descricaoPagamento,

                payment_method_id: "pix",

                payer: {
                    email: email.trim(),
                    first_name: nome.trim()
                }
            },

            requestOptions: {
                idempotencyKey: crypto.randomUUID()
            }

        });


        /* ---------------------------------------------
           DADOS DO PIX
        --------------------------------------------- */

        const transactionData =
            resultado?.point_of_interaction?.transaction_data;

        if (!transactionData) {

            console.error(
                "Mercado Pago não retornou os dados do PIX:",
                resultado
            );

            return res.status(500).json({
                sucesso: false,
                erro: "O Mercado Pago não retornou os dados do PIX."
            });
        }


        /* ---------------------------------------------
           RESPOSTA
        --------------------------------------------- */

        res.json({

            sucesso: true,

            status: resultado.status,

            status_detail: resultado.status_detail,

            pagamento_id: resultado.id,

            qr_code: transactionData.qr_code,

            qr_code_base64:
                transactionData.qr_code_base64,

            ticket_url:
                transactionData.ticket_url || null,

            expiracao:
                resultado.date_of_expiration || null

        });

    } catch (erro) {

        console.error(
            "Erro ao criar pagamento PIX:",
            erro
        );

        res.status(500).json({
            sucesso: false,
            erro:
                erro.message ||
                "Erro ao criar pagamento PIX."
        });
    }
});


/* =========================================================
   PAGAMENTO COM CARTÃO
========================================================= */

app.post("/api/processar-pagamento", async (req, res) => {
    try {

        const {
            transaction_amount,
            token,
            installments,
            payment_method_id,
            issuer_id,
            payer
        } = req.body;

        const valor = Number(transaction_amount);

        const valoresPermitidos = [
            50,
            100,
            200,
            500,
            1000,
            2000
        ];


        /* ---------------------------------------------
           VALIDAÇÃO DO VALOR
        --------------------------------------------- */

        if (!Number.isFinite(valor) || valor <= 0) {
            return res.status(400).json({
                sucesso: false,
                erro: "Valor de pagamento inválido."
            });
        }

        if (!valoresPermitidos.includes(valor)) {
            return res.status(400).json({
                sucesso: false,
                erro: "Este valor não está disponível para apadrinhamento."
            });
        }


        /* ---------------------------------------------
           VALIDAÇÃO DO PAGADOR
        --------------------------------------------- */

        if (!payer || !payer.email) {
            return res.status(400).json({
                sucesso: false,
                erro: "Nome e e-mail são obrigatórios."
            });
        }


        /* ---------------------------------------------
           DESCRIÇÃO
        --------------------------------------------- */

        const descricaoPagamento =
            "Apadrinhe um Desbravador - Campori Barretos 2027";


        /* ---------------------------------------------
           CRIAÇÃO DO PAGAMENTO
        --------------------------------------------- */

        const resultado = await payment.create({

            body: {

                transaction_amount: valor,

                token,

                description: descricaoPagamento,

                installments:
                    Number(installments),

                payment_method_id,

                issuer_id,

                payer

            },

            requestOptions: {
                idempotencyKey: crypto.randomUUID()
            }

        });


        /* ---------------------------------------------
           STATUS
        --------------------------------------------- */

        const status = resultado.status;

        let mensagem;


        switch (status) {

            case "approved":

                mensagem =
                    "Pagamento aprovado com sucesso!";

                break;


            case "pending":

                mensagem =
                    "Pagamento pendente. Aguarde a confirmação.";

                break;


            case "in_process":

                mensagem =
                    "Pagamento em análise pelo Mercado Pago.";

                break;


            case "rejected":

                mensagem =
                    "Pagamento recusado. Verifique os dados e tente novamente.";

                break;


            default:

                mensagem =
                    "Pagamento recebido. Aguardando confirmação.";

        }


        /* ---------------------------------------------
           RESPOSTA
        --------------------------------------------- */

        res.json({

            sucesso: true,

            status: status,

            mensagem: mensagem,

            pagamento: resultado

        });

    } catch (erro) {

        console.error(
            "Erro ao processar pagamento:",
            erro
        );

        res.status(500).json({

            sucesso: false,

            erro:
                erro.message ||
                "Erro ao processar pagamento"

        });
    }
});


/* =========================================================
   INICIALIZAÇÃO DO SERVIDOR
========================================================= */

const servidor = app.listen(PORT, () => {

    console.log(
        `Servidor rodando em http://localhost:${PORT}`
    );

});


/* =========================================================
   TRATAMENTO DE ERROS
========================================================= */

servidor.on("error", (erro) => {

    console.error(
        "ERRO NO SERVIDOR:",
        erro
    );

});


process.on("exit", (codigo) => {

    console.log(
        "PROCESSO NODE ENCERRADO. Código:",
        codigo
    );

});


process.on("uncaughtException", (erro) => {

    console.error(
        "ERRO NÃO TRATADO:",
        erro
    );

});
