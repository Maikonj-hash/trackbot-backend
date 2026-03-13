import { Injectable, Logger } from '@nestjs/common';

export type ValidationResult = {
  isValid: boolean;
  value?: string;
  errorMessage?: string;
};

@Injectable()
export class FieldValidatorService {
  private readonly logger = new Logger(FieldValidatorService.name);

  async validateAndFormat(
    value: string | undefined,
    expectedType?: string,
  ): Promise<ValidationResult> {
    if (!value || typeof value !== 'string') {
      return { isValid: false, errorMessage: 'Formato inválido. Por favor, envie um texto.' };
    }

    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return { isValid: false, errorMessage: 'Formato inválido. Por favor, envie um texto.' };
    }

    switch (expectedType) {
      case 'EMAIL':
        return this.validateEmail(trimmedValue);
      case 'PHONE':
        return this.validatePhone(trimmedValue);
      case 'CPF_CNPJ':
        return this.validateCpfCnpj(trimmedValue);
      case 'NUMBER':
        return this.validateNumber(trimmedValue);
      case 'CEP':
        return this.validateCep(trimmedValue);
      case 'LICENSE_PLATE':
        return this.validateLicensePlate(trimmedValue);
      case 'DATE':
        return this.validateDate(trimmedValue);
      case 'TIME':
        return this.validateTime(trimmedValue);
      case 'TEXT':
      default:
        return { isValid: true, value: trimmedValue };
    }
  }

  private validateEmail(value: string): ValidationResult {
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    return {
      isValid,
      value: isValid ? value.toLowerCase() : undefined,
      errorMessage: isValid ? undefined : 'Formato de e-mail inválido.',
    };
  }

  private validatePhone(value: string): ValidationResult {
    const cleanPhone = value.replace(/\D/g, '');
    const isValid = cleanPhone.length >= 10 && cleanPhone.length <= 15;
    return {
      isValid,
      value: isValid ? cleanPhone : undefined,
      errorMessage: isValid ? undefined : 'Formato de telefone inválido.',
    };
  }

  private validateCpfCnpj(value: string): ValidationResult {
    const cleanDoc = value.replace(/\D/g, '');

    let isValid = false;

    if (cleanDoc.length === 11) {
      isValid = this.isValidCpf(cleanDoc);
    } else if (cleanDoc.length === 14) {
      isValid = this.isValidCnpj(cleanDoc);
    }

    return {
      isValid,
      value: isValid ? cleanDoc : undefined,
      errorMessage: isValid ? undefined : 'Documento inválido. Informe um CPF (11) ou CNPJ (14) autêntico.',
    };
  }

  private isValidCpf(cpf: string): boolean {
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    let sum = 0, remainder;
    for (let i = 1; i <= 9; i++) sum = sum + parseInt(cpf.substring(i - 1, i)) * (11 - i);
    remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cpf.substring(9, 10))) return false;
    sum = 0;
    for (let i = 1; i <= 10; i++) sum = sum + parseInt(cpf.substring(i - 1, i)) * (12 - i);
    remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    return remainder === parseInt(cpf.substring(10, 11));
  }

  private isValidCnpj(cnpj: string): boolean {
    if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
    let size = cnpj.length - 2;
    let numbers = cnpj.substring(0, size);
    let digits = cnpj.substring(size);
    let sum = 0;
    let pos = size - 7;
    for (let i = size; i >= 1; i--) {
      sum += parseInt(numbers.charAt(size - i)) * pos--;
      if (pos < 2) pos = 9;
    }
    let result = sum % 11 < 2 ? 0 : 11 - sum % 11;
    if (result !== parseInt(digits.charAt(0))) return false;

    size = size + 1;
    numbers = cnpj.substring(0, size);
    sum = 0;
    pos = size - 7;
    for (let i = size; i >= 1; i--) {
      sum += parseInt(numbers.charAt(size - i)) * pos--;
      if (pos < 2) pos = 9;
    }
    result = sum % 11 < 2 ? 0 : 11 - sum % 11;
    return result === parseInt(digits.charAt(1));
  }

  private validateNumber(value: string): ValidationResult {
    const num = Number(value);
    const isValid = !isNaN(num) && value !== '';
    return {
      isValid,
      value: isValid ? num.toString() : undefined,
      errorMessage: isValid ? undefined : 'Por favor, informe apenas números reais.',
    };
  }

  private validateCep(value: string): ValidationResult {
    const cleanCep = value.replace(/\D/g, '');
    const isValid = cleanCep.length === 8;
    return {
      isValid,
      value: isValid ? cleanCep : undefined,
      errorMessage: isValid ? undefined : 'CEP inválido. Deve conter 8 dígitos.',
    };
  }

  private validateLicensePlate(value: string): ValidationResult {
    const cleanPlate = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const isValid = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(cleanPlate);
    return {
      isValid,
      value: isValid ? cleanPlate : undefined,
      errorMessage: isValid ? undefined : 'Placa inválida. O formato deve ser ABC1234 ou Mercosul ABC1D23.',
    };
  }

  private validateDate(value: string): ValidationResult {
    const regex = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
    const match = value.match(regex);

    if (!match) {
      return { isValid: false, errorMessage: 'Formato de data inválido. Use DD/MM/AAAA.' };
    }

    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);

    const date = new Date(year, month - 1, day);
    const isValid = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
    const isWithinRange = year >= 1900 && year <= 2100;

    if (!isValid || !isWithinRange) {
      return { isValid: false, errorMessage: 'A data informada não existe no calendário ou é inválida.' };
    }

    return {
      isValid: true,
      value: `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`,
    };
  }

  private validateTime(value: string): ValidationResult {
    const regex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
    const match = value.match(regex);

    if (!match) {
      return { isValid: false, errorMessage: 'Formato de horário inválido. Use HH:MM.' };
    }

    const formatted = `${match[1].padStart(2, '0')}:${match[2]}`;
    return {
      isValid: true,
      value: formatted,
    };
  }
}
