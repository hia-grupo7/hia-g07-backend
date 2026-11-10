const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }

  async enviarCodigoOTP(emailDestino, codigoOTP) {
    const mailOptions = {
      from: `"Seguridad Rayuela" <${process.env.EMAIL_USER}>`,
      to: emailDestino,
      subject: 'Código de verificación de doble factor (2FA)',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
          <h2 style="color: #333;">Inicio de Sesión Protegido</h2>
          <p>Has iniciado sesión en un dispositivo nuevo o tu rol requiere verificación adicional.</p>
          <p>Tu código de seguridad temporal es:</p>
          <div style="font-size: 24px; font-weight: bold; background-color: #f4f4f4; padding: 10px; text-align: center; border-radius: 4px; letter-spacing: 5px; color: #1e88e5;">
            ${codigoOTP}
          </div>
          <p style="color: #666; font-size: 12px; margin-top: 20px;">Este código expirará en 5 minutos.</p>
        </div>
      `
    };

    try {
      // Verificar si las credenciales están vacías para no tumbar la app en pruebas locales
      if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log(`\n🔑 [MOCK EMAIL] OTP enviado a ${emailDestino}: ${codigoOTP}\n`);
        return true;
      }
      await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error('Error al enviar el correo electrónico de 2FA:', error.message);
      // Para pruebas, si falla el envío real, mostramos el código en consola
      console.log(`🔑 [RESPALDO CONSOLA] Código OTP: ${codigoOTP}`);
      return false;
    }
  }
}

module.exports = new EmailService();