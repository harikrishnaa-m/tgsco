import { AppError } from '../../errors/app-error.js';
import { createContactInquiry, listContactInquiries } from './contact-inquiry.service.js';
import { contactInquirySchema } from './contact-inquiry.validation.js';

export async function create(req, res) {
  const data = contactInquirySchema.parse(req.body);
  const inquiry = await createContactInquiry(data);

  res.status(201).json({
    success: true,
    data: {
      id: inquiry._id.toString(),
      message: 'Your message has been sent successfully.',
    },
  });
}

export async function list(req, res) {
  const status = req.query.status;
  if (status && !['new', 'read', 'resolved'].includes(status)) {
    throw new AppError('The status filter must be new, read, or resolved.', {
      statusCode: 400,
      code: 'INVALID_INQUIRY_STATUS',
    });
  }

  const data = await listContactInquiries(status);
  res.status(200).json({ success: true, data });
}
