from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator

class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

class Margins(StrictModel):
    top: StrictInt = Field(ge=0)
    right: StrictInt = Field(ge=0)
    bottom: StrictInt = Field(ge=0)
    left: StrictInt = Field(ge=0)

class PageSettings(StrictModel):
    pageSize: Literal["A4", "A5"]
    orientation: Literal["portrait", "landscape"]
    margins: Margins

    @model_validator(mode="after")
    def fit_margins(self):
        width, height = (210, 297) if self.pageSize == "A4" else (148, 210)
        if self.orientation == "landscape":
            width, height = height, width
        if self.margins.left + self.margins.right >= width or self.margins.top + self.margins.bottom >= height:
            raise ValueError("Margins must leave room for content on the page.")
        return self

class Draft(StrictModel):
    html: str = Field(max_length=8_000_000)
    pageSettings: PageSettings
    name: str = Field(default="Untitled document", min_length=1, max_length=200)

    @model_validator(mode="after")
    def trim_name(self):
        self.name = self.name.strip()
        if not self.name:
            raise ValueError("Template name cannot be empty.")
        return self

class TemplatePayload(Draft):
    name: str = Field(min_length=1, max_length=200)


class PdfRequest(StrictModel):
    templateId: StrictInt = Field(gt=0)
    documentId: str = Field(min_length=1, max_length=200, pattern=r"^\S+$")
