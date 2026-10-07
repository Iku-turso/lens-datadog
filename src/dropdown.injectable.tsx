import { dropDownMenu, getDropDownMenuItemInjectableBunch, getDropDownMenuKind, useCloseDropDownMenu } from "@k8slens/drop-down-menu-contracts";
import { Button, Div } from "@k8slens/element-components";
import { type SelectOption, SingleSelect } from "@k8slens/input-components";

interface DropdownData {
  readonly options: readonly SelectOption<string>[];
  readonly selected: string;
  readonly onSelect: (id: string) => void;
}

const dropdownMenuKind = getDropDownMenuKind<DropdownData>()("datadog-dropdown");

const DropdownOptions = ({ data }: { data: DropdownData }) => {
  const closeMenu = useCloseDropDownMenu();

  return (
    <Div style={{ maxHeight: "min(24rem, 60vh)", minWidth: "14rem" }} $overflow={{ y: "auto" }}>
      <SingleSelect
        $padding="xs"
        options={data.options}
        selected={data.selected}
        onSelect={(id) => {
          data.onSelect(id);
          closeMenu();
        }}
      />
    </Div>
  );
};

export const dropdownOptionsItem = getDropDownMenuItemInjectableBunch({
  id: "datadog-dropdown-options",
  kind: dropdownMenuKind,
  orderNumber: 10,
  Component: DropdownOptions,
});

/** A choice of one option, shown as the chosen option on a button that opens the others. */
export const Dropdown = ({ "aria-label": label, ...data }: DropdownData & { readonly "aria-label": string }) => (
  <Button
    aria-label={label}
    $dropDownMenu={dropDownMenu(dropdownMenuKind, { data })}
    $padding={{ horizontal: "s", vertical: "xxs" }}
    $border={{ color: "grey60", radius: "s" }}
    $flexChild="fixed"
  >
    {data.options.find((option) => option.id === data.selected)?.label ?? data.selected} ▾
  </Button>
);
