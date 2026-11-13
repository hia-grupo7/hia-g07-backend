const { GoogleGenerativeAI } = require('@google/generative-ai');

const chatService = {};

chatService.consultarLibro = async (pregunta, tituloLibro, autorLibro) => {
    try {
        const apiKey = process.env.GEMINI_API_KEY;

        // Si la clave no está configurada o tiene formato inválido, usar respuesta contextual amigable
        if (!apiKey || apiKey.startsWith('AQ.') || apiKey.trim() === '') {
            console.warn('GEMINI_API_KEY no configurada o inválida. Usando respuesta asistida de Rayuela.');
            return `¡Hola! "${tituloLibro}" de ${autorLibro} es una de las obras más destacadas de nuestro catálogo en Rayuela. Es una lectura fascinante que recomendamos ampliamente. ¿Te gustaría agregarlo al carrito o conocer más detalles?`;
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        // Modelo oficial Gemini 1.5 Flash
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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
        console.error('Error al comunicarse con la IA:', error.message);
        // Fallback elegante para que el asistente siempre responda al cliente
        return `¡Hola! "${tituloLibro}" de ${autorLibro} es una lectura imprescindible. Explora temas cautivadores que lo convierten en un favorito de nuestros lectores. ¡Podés reservarlo o sumarlo a tu compra hoy mismo!`;
    }
};

module.exports = chatService;
