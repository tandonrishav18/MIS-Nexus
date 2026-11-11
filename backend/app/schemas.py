from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

EdiDocCode = Literal["850", "855", "810", "856"]
TransactionStatus = Literal["Accepted", "Pending", "Rejected", "Processing", "Draft"]
AckStatus = Literal["Acknowledged", "Awaiting Ack", "Not Required", "Exception"]


class LineItemIn(BaseModel):
    sku: str = Field(..., min_length=1, max_length=80)
    description: str = Field(..., min_length=1, max_length=255)
    quantity: int = Field(..., gt=0)
    unitPrice: Decimal = Field(..., gt=Decimal("0"))

    @field_validator("sku", "description")
    @classmethod
    def strip_required(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Field cannot be empty")
        return s


class LineItemOut(BaseModel):
    id: str
    sku: str
    description: str
    quantity: int
    unitPrice: float
    lineTotal: float


class ValidationCheckOut(BaseModel):
    id: str
    ruleCode: str
    label: str
    status: Literal["pass", "warning", "fail"]
    detail: str


class ProcessingEventOut(BaseModel):
    id: str
    timestamp: str
    step: str
    actor: str
    status: Literal["completed", "warning", "error", "info"]
    note: str


class AcknowledgementOut(BaseModel):
    ackDocNumber: str
    ackDate: str
    ackCode: Literal["AC", "AD", "RD"]
    note: str


class TransactionOut(BaseModel):
    id: str
    transactionId: str
    documentNumber: str
    documentType: EdiDocCode
    sender: str
    receiver: str
    transactionDate: str
    subtotal: float
    taxRatePct: float
    taxAmount: float
    amount: float
    status: TransactionStatus
    referencePo: Optional[str] = None
    ackStatus: AckStatus
    summary: str
    exceptionReason: Optional[str] = None
    reviewerNotes: Optional[str] = None
    lineItems: list[LineItemOut]
    validationResults: list[ValidationCheckOut]
    ediPayload: str
    timeline: list[ProcessingEventOut]
    acknowledgement: Optional[AcknowledgementOut] = None
    supplierReceiptSimulated: bool = False
    isDemoSeed: bool = False


class PaginatedTransactionsOut(BaseModel):
    items: list[TransactionOut]
    total: int
    page: int
    pageSize: int
    totalPages: int


class DocumentCreateIn(BaseModel):
    documentType: EdiDocCode = "850"
    documentNumber: str = Field(..., min_length=1, max_length=80)
    documentDate: str = Field(..., min_length=8, max_length=40)
    sender: str = Field(..., min_length=1, max_length=150)
    receiver: str = Field(..., min_length=1, max_length=150)
    referencePo: Optional[str] = Field(default=None, max_length=80)
    taxRatePct: Decimal = Field(default=Decimal("0"), ge=Decimal("0"), le=Decimal("100"))
    summary: str = Field(default="", max_length=500)
    lineItems: list[LineItemIn] = Field(..., min_length=1)
    declaredTotal: Optional[Decimal] = Field(default=None, gt=Decimal("0"))
    mode: Literal["draft", "submit"] = "submit"

    @field_validator("sender", "receiver", "documentNumber")
    @classmethod
    def check_not_blank(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Required field cannot be blank")
        return s


class TransactionUpdateIn(BaseModel):
    lineItems: Optional[list[LineItemIn]] = Field(default=None, min_length=1)
    taxRatePct: Optional[Decimal] = Field(default=None, ge=Decimal("0"), le=Decimal("100"))
    summary: Optional[str] = Field(default=None, max_length=500)
    reviewerNotes: Optional[str] = Field(default=None, max_length=1000)


class ApproveRequestIn(BaseModel):
    note: Optional[str] = Field(default=None, max_length=1000)


class RejectRequestIn(BaseModel):
    reason: str = Field(default="", max_length=1000)


class PartnerCreateIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    role: Literal["Buyer", "Supplier", "Logistics"]
    partnerCode: str = Field(..., min_length=2, max_length=40)
    isaQualifier: str = Field(default="ZZ", min_length=2, max_length=4)
    isaId: str = Field(..., min_length=2, max_length=32)
    gsId: str = Field(..., min_length=2, max_length=32)
    supportedDocs: list[EdiDocCode] = Field(..., min_length=1)
    active: bool = True
    gstin: str = ""
    city: str = ""
    state: str = ""
    contactName: str = ""
    contactEmail: str = ""
    contactPhone: str = ""
    slaAckHours: int = Field(default=8, ge=1, le=168)
    notes: str = ""


class PartnerUpdateIn(BaseModel):
    active: Optional[bool] = None
    role: Optional[Literal["Buyer", "Supplier", "Logistics"]] = None
    supportedDocs: Optional[list[EdiDocCode]] = None
    contactName: Optional[str] = None
    contactEmail: Optional[str] = None
    contactPhone: Optional[str] = None
    slaAckHours: Optional[int] = Field(default=None, ge=1, le=168)
    notes: Optional[str] = None


class PartnerOut(BaseModel):
    id: str
    name: str
    role: Literal["Buyer", "Supplier", "Logistics"]
    partnerCode: str
    isaQualifier: str
    isaId: str
    gsId: str
    supportedDocs: list[EdiDocCode]
    active: bool
    isDemoSeed: bool
    gstin: str
    city: str
    state: str
    contactName: str
    contactEmail: str
    contactPhone: str
    slaAckHours: int
    notes: str
    totalTransactions: int = 0
    acceptedCount: int = 0
    rejectedCount: int = 0
    totalVolume: float = 0.0


class PartnerDetailOut(BaseModel):
    partner: PartnerOut
    transactions: list[TransactionOut]


class MappingRuleCreateIn(BaseModel):
    documentType: Literal["850", "810"]
    sourceField: str = Field(..., min_length=1, max_length=120)
    sourcePath: str = Field(..., min_length=1, max_length=120)
    ediSegment: str = Field(..., min_length=1, max_length=20)
    ediElement: str = Field(..., min_length=1, max_length=40)
    ediDescription: str = Field(default="", max_length=200)
    transformRule: str = Field(default="DIRECT_STRING(value)", max_length=120)
    status: Literal["Mapped", "Conditional", "Custom"] = "Custom"
    required: bool = False


class MappingRuleUpdateIn(BaseModel):
    documentType: Optional[Literal["850", "810"]] = None
    sourceField: Optional[str] = Field(default=None, min_length=1, max_length=120)
    sourcePath: Optional[str] = Field(default=None, min_length=1, max_length=120)
    ediSegment: Optional[str] = Field(default=None, min_length=1, max_length=20)
    ediElement: Optional[str] = Field(default=None, min_length=1, max_length=40)
    ediDescription: Optional[str] = Field(default=None, max_length=200)
    transformRule: Optional[str] = Field(default=None, max_length=120)
    status: Optional[Literal["Mapped", "Conditional", "Custom"]] = None


class MappingRuleOut(BaseModel):
    id: str
    documentType: Literal["850", "810"]
    sourceField: str
    sourcePath: str
    ediSegment: str
    ediElement: str
    ediDescription: str
    transformRule: str
    status: Literal["Mapped", "Conditional", "Custom"]
    required: bool


class AppSettingsOut(BaseModel):
    organizationName: str
    hubCode: str
    hubGstin: str
    adminEmail: str
    defaultTaxRatePct: float
    autoValidateOnSubmit: bool
    ediStandardVersion: str
    segmentTerminator: str
    elementSeparator: str
    ollamaEndpoint: str
    ollamaModel: str


class AppSettingsUpdateIn(BaseModel):
    organizationName: str = Field(..., min_length=1, max_length=160)
    hubCode: str = Field(..., min_length=1, max_length=60)
    hubGstin: str = Field(default="", max_length=32)
    adminEmail: str = Field(default="", max_length=150)
    defaultTaxRatePct: Decimal = Field(default=Decimal("0"), ge=Decimal("0"), le=Decimal("100"))
    autoValidateOnSubmit: bool = True
    ediStandardVersion: str = Field(default="ANSI X12 · 004010", max_length=60)
    segmentTerminator: str = Field(default="~", min_length=1, max_length=4)
    elementSeparator: str = Field(default="*", min_length=1, max_length=4)
    ollamaEndpoint: str = Field(default="http://localhost:11434", max_length=200)
    ollamaModel: str = Field(default="qwen2.5:7b", max_length=80)


class AssistantQueryIn(BaseModel):
    question: str = Field(..., min_length=1, max_length=1000)


class AssistantQueryOut(BaseModel):
    reply: str
    engineLabel: str
    relatedTransactionIds: list[str]
    ollamaUsed: bool = False


class DocumentAiExplainOut(BaseModel):
    explanation: str
    recommendation: str
    engineLabel: str
    ollamaUsed: bool = False
    invoiceTotal: Optional[str] = None
    purchaseOrderTotal: Optional[str] = None
    difference: Optional[str] = None

