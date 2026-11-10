const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const chatService = {};

chatService.consultarLibro = async (pregunta, tituloLibro, autorLibro) => {
    try {

        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const prompt = `
            Sos un asistente de ventas virtual experto de la librería "Rayuela".
            El cliente está viendo el libro "${tituloLibro}" del autor "${autorLibro}".
            Tu objetivo es responder su pregunta de forma amable, concisa (máximo 3 oraciones) y persuasiva para que compre el libro.
            Si te preguntan algo que no tiene nada que ver con libros o la librería, respondé amablemente que solo podés ayudar con temas literarios.
            
            Pregunta del cliente: "${pregunta}"
        `;

        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (error) {
        throw new Error(`Error al comunicarse con la IA: ${error.message}`);
    }
};

module.exports = chatService;